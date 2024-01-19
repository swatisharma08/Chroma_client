import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";
import Express from "express";
import cors from "cors";
import { htmlToText } from 'html-to-text';
import { ChromaClient, OpenAIEmbeddingFunction } from 'chromadb';
import multer from 'multer';
import OpenAI from "openai";
dotenv.config();
const upload = multer({ dest: 'uploads/' })
const app = new Express();
const client = new ChromaClient();
app.use(cors())
app.use(Express.json());

const server = app.listen(3000, () => {
    console.log("Server is running on port 3000");
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
            console.log('Files deleted successfully.');
        } catch (error) {
            console.error('Error deleting files:', error);
        }

        const collection = await client.createCollection({
            name: collectionName,
            embeddingFunction: embedder,
        });

        console.log(collection,'collection')
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



app.post('/getResults', async (req, res) => {
    const { body } = req; 
    console.log(body, 'body')

    const { message, collectionName } = body;

    try {   
        const collection = await client.getCollection({ 
            name: collectionName,
            embeddingFunction: embedder 
        });
    
        const results = await collection.query({
            nResults: 2,
            queryTexts: [message],
        });

        console.log(results, 'results')
    
        const talkToOpenAIResults = await talkToOpenAI([
            {
                role: 'assistant',
                content: `
                    ${results.documents[0][0]}
    
                    ==========
    
                    From above answer the user question.
                `
            },
            {
                role: 'user',
                content: message,
            }
        ]);
    
        res.status(200).json({
            talkToOpenAIResults
        });
    } catch (error) {
        console.log(error, 'error')
        res.status(500).json({
            message: 'Error getting results',
            error
        });
    }

    

    // io.on('connection', (socket) => {
    //     console.log('A client connected');
        
    //     // Handle the 'talkToOpenAI' event
    //     socket.on('talkToOpenAI', () => {
    //         // Call the talkToOpenAI function and emit the results to the client
    //         const results = talkToOpenAI([
    //             {
    //                 role: 'assistant',
    //                 content: `
    //                     ${results.documents[0][0]}
        
    //                     ==========
        
    //                     From above answer the user question.
    //                 `
    //             },
    //             {
    //                 role: 'user',
    //                 content: message,
    //             }
    //         ]);
    //         socket.emit('openAIResults', results);
    //     });
        
    //     // Handle the 'disconnect' event
    //     socket.on('disconnect', () => {
    //         console.log('A client disconnected');
    //     });
    // });

});

export const talkToOpenAI = async (messages) => {
    const stream = await openai.chat.completions.create({
        messages: messages,
        model: 'gpt-3.5-turbo-16k',
        stream: true,
    });

    let message = '';

    for await (const chunk of stream) {
        message = `${message}${chunk.choices[0]?.delta?.content || ''}`
        console.log(message);
    }

    return message;
}

