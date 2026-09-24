import express from 'express';
import { requestId } from './middleware/requestId.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { routes } from './routes/index.js';

// The app is built here but not started, so tests can call it with Supertest without opening a port.
export const app = express();

app.disable('x-powered-by');
app.use(requestId);
app.use(express.json({ limit: '10kb' }));

app.use(routes);

app.use(notFound);
app.use(errorHandler);
