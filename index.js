import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";
import Express from "express";
import cors from "cors";
import { ChromaClient, OpenAIEmbeddingFunction } from 'chromadb';
import multer from 'multer';
import OpenAI from "openai";
import { Server } from "socket.io";
import { marked } from "marked";
dotenv.config();
const upload = multer({ dest: 'uploads/' })
const app = new Express();
const client = new ChromaClient();
app.use(cors())
app.use(Express.json());

const server = app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});

const io = new Server(server, {
    cors: {
        origin: '*',
    },
});

io.on('connection', (socket) => { // Listen for a connection
    socket.on('question', async (question) => {
        const { text, collectionName } = question;

        const collection = await client.getCollection({ 
            name: collectionName,
            embeddingFunction: embedder 
        });
    
        const results = await collection.query({
            nResults: 2,
            queryTexts: [text],
        });

        const messages = [
            {
                role: 'assistant',
                content: `
                    ${results.documents.reduce((result, document) => {
                        return `${result}\n\n${document[0]}`
                    })}
    
                    ==========

                    You are Manoj Singh Negi. A web developer.

                    * Make sure to only answer the questions using the above text.
                    * Use markdown to format your answer.
                    * Provide links to articles and youtube videos to support your answer.
    
                    From above text answer the user question. Try to answer in 2-3 sentences.
                `
            },
            {
                role: 'user',
                content: text,
            }
        ]

        let messageToSend = '';

        for await (const message of talkToOpenAI(messages)) {
            for (const letter of message) {
                messageToSend += letter;
                socket.emit('answer', marked(messageToSend));
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }
    });
});

const openai = new OpenAI({
    apiKey: process.env.OPENAPI_KEY,
});

const embedder = new OpenAIEmbeddingFunction({
    openai_api_key: process.env.OPENAPI_KEY,
});

app.post('/createCollection', upload.array('files'), async (req, res) => {
    const { collectionName } = req.body;
    const files = req.files;
    const documents = [];
    const metadatas = [];
    const ids = [];
    try {

        for (let file of files) {
            const fileContent = fs.readFileSync(file.path, 'utf8');
            documents.push(fileContent)
            metadatas.push({
                source: file.originalname
            })
            ids.push(crypto.randomUUID());
        }

        try {
            fs.readdirSync('uploads/').forEach(file => {
                fs.unlinkSync(`uploads/${file}`);
            });
        } catch (error) {
            console.error('Error deleting files:', error);
        }

        const collection = await client.getOrCreateCollection({
            name: collectionName,
            embeddingFunction: embedder,
        });

        await collection.add({
            ids,
            metadatas,
            documents,
        });
    
        res.status(200).json({
            message: 'Successfully created collection',
            collectionId: collection.id
        });
    } catch (error) {
        console.log(error, 'error')
        res.status(500).json({
            message: 'Error creating collection',
            error
        });
    }
})

export const talkToOpenAI = async function* (messages) {
    const stream = await openai.chat.completions.create({
        messages: messages,
        model: 'gpt-3.5-turbo-16k',
        stream: true,
    });

    for await (const chunk of stream) {
        yield chunk.choices[0]?.delta?.content || '';
    }
}

