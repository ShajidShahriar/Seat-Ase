import express from 'express';
import cookieParser from 'cookie-parser';
import { requestId } from './middleware/requestId.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { routes } from './routes/index.js';
import { env } from './config/env.js';

// The app is built here but not started, so tests can call it with Supertest without opening a port.
export const app = express();

app.disable('x-powered-by');
if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(requestId);
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use(routes);

app.use(notFound);
app.use(errorHandler);
