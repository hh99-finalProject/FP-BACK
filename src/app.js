import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import cors from 'cors';
import LogMiddleware from './middlewares/logMiddleware.js';
import generalErrorHandler from './middlewares/generalErrorMiddleware.js';
import router from './routes/index.js';
import jwt from 'jsonwebtoken';
import bodyParser from 'body-parser';
import { loadBannedWords } from './utils/bannedWordsLoader.js';
import { swaggerUi, specs } from './swagger/swaggerOptions.js';
import './scheduler.js';

const app = express();
const PORT = 3000;

// CORS 미들웨어 설정
app.use(
    cors({
        origin: '*',
        methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }),
);

// CORS Preflight 요청 처리
app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(204).json({});
    }
    next();
});

app.use(bodyParser.json());
app.use(express.json());

app.use(LogMiddleware);
app.use(cookieParser());

app.use('/', router);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

app.use(generalErrorHandler);

loadBannedWords()
    .then(() => {
        console.log('금지어 목록이 메모리에 로드되었습니다.');
    })
    .catch((error) => {
        console.error('금지어 목록 로딩 중 오류 발생:', error);
    });

app.listen(PORT, () => {
    console.log(`${PORT} 포트로 서버가 열렸어요!`);
});
