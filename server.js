import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import router from './src/router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(join(__dirname, 'public')));
app.use('/api', router);

app.listen(PORT, () => console.log(`Kobo Ratings running at http://localhost:${PORT}`));
