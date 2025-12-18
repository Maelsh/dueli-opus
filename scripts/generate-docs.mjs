import fs from 'fs/promises';
import path from 'path';
import { marked } from 'marked';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIKI_DIR = path.join(__dirname, '../docs/wiki');
const OUT_DIR = path.join(__dirname, '../docs/site');
const TEMPLATE_PATH = path.join(__dirname, 'templates/layout.html');

// Ensure output dir exists
await fs.mkdir(OUT_DIR, { recursive: true });

// Read Template
const template = await fs.readFile(TEMPLATE_PATH, 'utf-8');

// Get all MD files
const files = await fs.readdir(WIKI_DIR);
const mdFiles = files.filter(f => f.endsWith('.md'));

// Build Navigation
const navLinks = mdFiles.map(file => {
    const name = file.replace('.md', '').replace(/_/g, ' ');
    const link = file.replace('.md', '.html');
    return `<li><a href="${link}" class="nav-link" data-page="${file.replace('.md', '')}">${name}</a></li>`;
}).join('\n');

// Convert Function
async function convertFile(filename) {
    const content = await fs.readFile(path.join(WIKI_DIR, filename), 'utf-8');

    // Parse Markdown
    let htmlContent = marked.parse(content);

    // Fix Links (file.md -> file.html)
    htmlContent = htmlContent.replace(/href="([^"]+)\.md"/g, 'href="$1.html"');

    // Make Mermaid diagrams renderable
    htmlContent = htmlContent.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, '<div class="mermaid">$1</div>');

    // Inject into Template
    const pageTitle = filename.replace('.md', '').replace(/_/g, ' ');
    const finalHtml = template
        .replace('{{TITLE}}', pageTitle)
        .replace('{{CONTENT}}', htmlContent)
        .replace('{{NAV}}', navLinks);

    // Write HTML
    await fs.writeFile(path.join(OUT_DIR, filename.replace('.md', '.html')), finalHtml);
    console.log(`Generated: ${filename.replace('.md', '.html')}`);
}

// Run
console.log('Generating Documentation Site...');
for (const file of mdFiles) {
    await convertFile(file);
}
console.log('Done! Open docs/site/Home.html');
