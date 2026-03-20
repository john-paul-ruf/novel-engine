import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const projectRoot = path.dirname(__dirname);

const bookFolder = process.argv[2];
if (!bookFolder) {
  console.error('Usage: node scripts/cover.js <book-folder>');
  process.exit(1);
}

const bookPath = path.join(projectRoot, 'books', bookFolder);
if (!fs.existsSync(bookPath)) {
  console.error(`✗ Book folder not found: books/${bookFolder}`);
  process.exit(1);
}

const aboutJson = JSON.parse(fs.readFileSync(path.join(bookPath, 'about.json'), 'utf-8'));
const TITLE = aboutJson.name;
const AUTHOR = aboutJson.author || 'Unknown Author';
const SLUG = TITLE.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

const sourceImage = path.join(bookPath, 'assets/cover-art.jpg');
const outputImage = path.join(bookPath, 'assets/cover.jpg');

if (!fs.existsSync(sourceImage)) {
  console.warn(`⚠ No books/${bookFolder}/assets/cover-art.jpg found. Add cover art and re-run this script.`);
  process.exit(1);
}

try {
  await sharp(sourceImage)
    .resize(1600, 2384, { fit: 'fill' })
    .jpeg({ quality: 95 })
    .toFile(outputImage);

  console.log(`✓ Cover built: books/${bookFolder}/assets/cover.jpg`);
} catch (err) {
  console.error(`✗ Error building cover:`, err.message);
  process.exit(1);
}
