import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { markdownToPdf, Pandoc } from 'auto-pandoc';
import { mdToPdf } from 'md-to-pdf';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const projectRoot = path.dirname(__dirname);

const bookFolder = process.argv[2];
if (!bookFolder) {
  console.error('Usage: node scripts/build.js <book-folder>');
  process.exit(1);
}

const bookPath = path.join(projectRoot, 'books', bookFolder);
if (!fs.existsSync(bookPath)) {
  console.error(`✗ Book folder not found: books/${bookFolder}`);
  process.exit(1);
}

const aboutJson = JSON.parse(fs.readFileSync(path.join(bookPath, 'about.json'), 'utf-8'));
const TITLE = aboutJson.title || aboutJson.name;
const SUBTITLE = aboutJson.subtitle || '';
const AUTHOR = aboutJson.author || 'AUTHOR_NAME';
const SLUG = TITLE.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

const COVER = path.join(bookPath, 'assets/cover.jpg');
const OUT_DIR = path.join(bookPath, 'dist');
const MD_OUT = path.join(OUT_DIR, `${SLUG}.md`);

// ── KDP 6×9 trim size settings ──────────────────────────────────
// KDP requires ≥0.625" gutter (inside) for 150-400 page books
// and ≥0.25" for outside, top, and bottom.
// Using 0.75" on all sides — symmetric margins avoid mirror-margin
// issues and comfortably exceed KDP minimums.
const TRIM = {
  width:  '6in',
  height: '9in',
  margin: {
    top:    '0.75in',
    bottom: '0.75in',
    left:   '0.75in',
    right:  '0.75in',
  }
};

function makeAnchor(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/ +/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractTitle(dir) {
  const draft = path.join(bookPath, 'chapters', dir, 'draft.md');
  if (!fs.existsSync(draft)) return '';

  const content = fs.readFileSync(draft, 'utf-8');
  const lines = content.split('\n');

  let label = '';
  let title = '';

  if (lines[0]?.startsWith('**') && lines[0]?.endsWith('**')) {
    label = lines[0].slice(2, -2);
  } else if (lines[0]?.startsWith('#')) {
    label = lines[0].replace(/^#+\s+/, '');
  }

  if (lines[2]?.startsWith('*') && lines[2]?.endsWith('*')) {
    title = lines[2].slice(1, -1);
  }

  return label && title ? `${label} — ${title}` : label;
}

function getPageBreakMarkdown() {
  return '\n---\n\n';
}

// ── DOCX post-processing ────────────────────────────────────────
// Modifies the generated docx to apply manuscript formatting:
// - Times New Roman 12pt, double-spaced, 0.5" first-line indent
// - 1-inch margins on 8.5×11 letter-size pages
// - Centered chapter headings with page-break-before
// - Running header: Author / TITLE / Page Number
function postProcessDocx(docxPath, title, author) {
  const tmpDir = path.join(OUT_DIR, '.docx-work');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    execSync(`unzip -o "${docxPath}" -d "${tmpDir}"`, { stdio: 'pipe' });

    // ── Fix styles.xml ──────────────────────────────────────────
    const stylesPath = path.join(tmpDir, 'word/styles.xml');
    let styles = fs.readFileSync(stylesPath, 'utf-8');

    // Normal: Times New Roman 12pt, double-spaced (480 twips = 2×),
    //         0.5" first-line indent (720 twips)
    styles = styles.replace(
      /(<w:style\s[^>]*w:styleId="Normal"[^>]*>)([\s\S]*?)(<\/w:style>)/,
      (_, open, _c, close) => `${open}
      <w:name w:val="Normal"/>
      <w:qFormat/>
      <w:pPr>
        <w:spacing w:line="480" w:lineRule="auto" w:after="0" w:before="0"/>
        <w:ind w:firstLine="720"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
      </w:rPr>
    ${close}`
    );

    // Heading1: TNR 14pt bold, centered, page-break-before,
    //           top space (1 inch = 2400 twips before, 480 after)
    styles = styles.replace(
      /(<w:style\s[^>]*w:styleId="Heading1"[^>]*>)([\s\S]*?)(<\/w:style>)/,
      (_, open, _c, close) => `${open}
      <w:name w:val="heading 1"/>
      <w:basedOn w:val="Normal"/>
      <w:next w:val="FirstParagraph"/>
      <w:qFormat/>
      <w:pPr>
        <w:keepNext/>
        <w:pageBreakBefore/>
        <w:jc w:val="center"/>
        <w:spacing w:before="2400" w:after="480" w:line="480" w:lineRule="auto"/>
        <w:ind w:firstLine="0"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:b/>
        <w:bCs/>
        <w:sz w:val="28"/>
        <w:szCs w:val="28"/>
      </w:rPr>
    ${close}`
    );

    // FirstParagraph: same as Normal but no first-line indent
    if (styles.includes('w:styleId="FirstParagraph"')) {
      styles = styles.replace(
        /(<w:style\s[^>]*w:styleId="FirstParagraph"[^>]*>)([\s\S]*?)(<\/w:style>)/,
        (_, open, _c, close) => `${open}
        <w:name w:val="First Paragraph"/>
        <w:basedOn w:val="Normal"/>
        <w:qFormat/>
        <w:pPr>
          <w:ind w:firstLine="0"/>
        </w:pPr>
      ${close}`
      );
    }

    // BodyText: inherit from Normal
    if (styles.includes('w:styleId="BodyText"')) {
      styles = styles.replace(
        /(<w:style\s[^>]*w:styleId="BodyText"[^>]*>)([\s\S]*?)(<\/w:style>)/,
        (_, open, _c, close) => `${open}
        <w:name w:val="Body Text"/>
        <w:basedOn w:val="Normal"/>
        <w:qFormat/>
      ${close}`
      );
    }

    fs.writeFileSync(stylesPath, styles);

    // ── Fix document.xml — page size, margins, header ref ───────
    const docPath = path.join(tmpDir, 'word/document.xml');
    let doc = fs.readFileSync(docPath, 'utf-8');

    // Ensure r: namespace is declared (needed for header reference)
    if (!doc.includes('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')) {
      doc = doc.replace(
        /(<w:document\s)/,
        '$1xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      );
    }

    // Replace sectPr: 8.5×11 letter (12240×15840 twips), 1" margins (1440 twips)
    doc = doc.replace(
      /<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/,
      `<w:sectPr>
        <w:headerReference w:type="default" r:id="rIdHeader1"/>
        <w:pgSz w:w="12240" w:h="15840"/>
        <w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440" w:header="720" w:footer="720" w:gutter="0"/>
      </w:sectPr>`
    );

    // Strip literal &quot; from metadata values in document body
    doc = doc.replace(/&quot;/g, '');

    fs.writeFileSync(docPath, doc);

    // ── Create header1.xml — running header ─────────────────────
    // Format: Author Name [tab] TITLE [tab] Page Number
    const headerXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Header"/>
      <w:tabs>
        <w:tab w:val="center" w:pos="4680"/>
        <w:tab w:val="right" w:pos="9360"/>
      </w:tabs>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
        <w:sz w:val="20"/>
        <w:szCs w:val="20"/>
      </w:rPr>
      <w:t xml:space="preserve">${author}</w:t>
    </w:r>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
        <w:sz w:val="20"/>
        <w:szCs w:val="20"/>
      </w:rPr>
      <w:tab/>
      <w:t xml:space="preserve">${title.toUpperCase()}</w:t>
    </w:r>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
        <w:sz w:val="20"/>
        <w:szCs w:val="20"/>
      </w:rPr>
      <w:tab/>
    </w:r>
    <w:r>
      <w:fldChar w:fldCharType="begin"/>
    </w:r>
    <w:r>
      <w:instrText xml:space="preserve"> PAGE </w:instrText>
    </w:r>
    <w:r>
      <w:fldChar w:fldCharType="end"/>
    </w:r>
  </w:p>
</w:hdr>`;
    fs.writeFileSync(path.join(tmpDir, 'word/header1.xml'), headerXml);

    // ── Add header relationship ─────────────────────────────────
    const relsPath = path.join(tmpDir, 'word/_rels/document.xml.rels');
    let rels = fs.readFileSync(relsPath, 'utf-8');
    rels = rels.replace(
      '</Relationships>',
      '  <Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>\n</Relationships>'
    );
    fs.writeFileSync(relsPath, rels);

    // ── Register header content type ────────────────────────────
    const ctPath = path.join(tmpDir, '[Content_Types].xml');
    let ct = fs.readFileSync(ctPath, 'utf-8');
    if (!ct.includes('header1.xml')) {
      ct = ct.replace(
        '</Types>',
        '  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>\n</Types>'
      );
    }
    fs.writeFileSync(ctPath, ct);

    // ── Fix core.xml metadata — strip literal &quot; ────────────
    const corePath = path.join(tmpDir, 'docProps/core.xml');
    if (fs.existsSync(corePath)) {
      let core = fs.readFileSync(corePath, 'utf-8');
      core = core.replace(/&quot;/g, '');
      fs.writeFileSync(corePath, core);
    }

    // ── Repackage docx ──────────────────────────────────────────
    fs.unlinkSync(docxPath);
    execSync(`cd "${tmpDir}" && zip -r -X "${docxPath}" . -x ".*"`, { stdio: 'pipe' });

    console.log(`  ✓ Post-processed: manuscript formatting applied`);
  } finally {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  }
}

// ── EPUB post-processing ────────────────────────────────────────
// Fixes epub:type on front matter pages (bodymatter → frontmatter)
function postProcessEpub(epubPath) {
  const tmpDir = path.join(OUT_DIR, '.epub-work');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    execSync(`unzip -o "${epubPath}" -d "${tmpDir}"`, { stdio: 'pipe' });

    const textDir = path.join(tmpDir, 'EPUB/text');
    if (fs.existsSync(textDir)) {
      for (const file of fs.readdirSync(textDir)) {
        const filePath = path.join(textDir, file);
        let content = fs.readFileSync(filePath, 'utf-8');

        // Fix epub:type on copyright and dedication pages
        if (content.includes('id="copyright"') || content.includes('id="dedication"')) {
          content = content.replace('epub:type="bodymatter"', 'epub:type="frontmatter"');
          fs.writeFileSync(filePath, content);
        }
      }
    }

    // Repackage epub — mimetype must be first entry, stored uncompressed
    fs.unlinkSync(epubPath);
    execSync(`cd "${tmpDir}" && zip -X0 "${epubPath}" mimetype && zip -rX9 "${epubPath}" . -x mimetype -x ".*"`, { stdio: 'pipe' });

    console.log(`  ✓ Post-processed: front matter epub:type corrected`);
  } finally {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  }
}


async function build() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let mdContent = '';

  if (fs.existsSync(COVER)) {
    mdContent += `![${TITLE}](${COVER})\n\n`;
  }

  if (SUBTITLE) {
    mdContent += `# ${TITLE}\n\n## ${SUBTITLE}\n\n*${AUTHOR}*\n\n---\n\n`;
  } else {
    mdContent += `# ${TITLE}\n\n*${AUTHOR}*\n\n---\n\n`;
  }

  const chaptersDir = path.join(bookPath, 'chapters');
  const chapters = fs.readdirSync(chaptersDir)
    .filter(f => fs.statSync(path.join(chaptersDir, f)).isDirectory())
    .sort();

  const tocEntries = [];
  const pageBreakMarkdown = getPageBreakMarkdown();

  for (const dir of chapters) {
    if (dir === 'zz-about-the-author' || dir.startsWith('_cut-')) continue;

    const partFile = path.join(chaptersDir, dir, 'part.txt');
    if (fs.existsSync(partFile)) {
      const [partTitle, partSub] = fs.readFileSync(partFile, 'utf-8').trim().split('\n');
      const anchor = makeAnchor(partTitle);

      mdContent += pageBreakMarkdown;
      mdContent += `---\n\n# ${partTitle} {#${anchor}}\n\n*${partSub}*\n\n---\n\n`;

      tocEntries.push('');
      tocEntries.push(`**[${partTitle}](#${anchor})**`);
    }

    const draft = path.join(chaptersDir, dir, 'draft.md');
    if (fs.existsSync(draft)) {
      mdContent += pageBreakMarkdown;

      // Read draft content, trimming any trailing --- to prevent double HRs
      let draftContent = fs.readFileSync(draft, 'utf-8').replace(/\n---\s*$/, '');

      if (!dir.startsWith('00-')) {
        const entry = extractTitle(dir);
        if (entry) {
          const anchor = makeAnchor(entry);
          tocEntries.push(`- **[${entry}](#${anchor})**`);
          // Inject anchor as heading attribute instead of standalone span.
          // Standalone []{#anchor} spans get split into the previous epub section
          // by pandoc, causing stray elements on dedication/copyright pages.
          draftContent = draftContent.replace(/^(# .+)$/m, `$1 {#${anchor}}`);
        }
      }

      mdContent += draftContent + '\n\n';
    }
  }

  const aboutAuthor = path.join(chaptersDir, 'zz-about-the-author', 'draft.md');
  if (fs.existsSync(aboutAuthor)) {
    mdContent += pageBreakMarkdown;
    mdContent += fs.readFileSync(aboutAuthor, 'utf-8') + '\n\n';
  }

  let toc = '## Contents\n\n';
  for (const entry of tocEntries) {
    toc += entry + '\n';
    if (entry) toc += '\n';
  }
  toc += '---\n\n';

  const marker = '\n---\n\n';
  const headerEndIdx = mdContent.indexOf(marker);
  const header = headerEndIdx !== -1 ? mdContent.slice(0, headerEndIdx + marker.length) : '';
  const body = mdContent.slice(header.length);

  mdContent = header + toc + body;

  // ── Markdown output ───────────────────────────────────────────
  let mdOut = mdContent;
  // Strip heading attributes for clean markdown (readers don't need them;
  // most renderers auto-generate matching IDs from heading text)
  mdOut = mdOut.replace(/ \{#[^}]+\}/g, '');

  fs.writeFileSync(MD_OUT, mdOut);

  const words = mdContent.split(/\s+/).length;
  console.log(`✓ Markdown built: ${MD_OUT} (${words} words)`);

  // ── DOCX (pandoc + post-processing) ───────────────────────────
  try {
    const docxOut = path.join(OUT_DIR, `${SLUG}.docx`);
    let docxMd = mdContent;
    docxMd = docxMd.replace(/^[\s\S]*?\n---\n\n/, '');
    docxMd = docxMd.replace(/```{=html}[\s\S]*?```\n*/g, '');
    docxMd = docxMd.replace(
      /\[\]\{#([^}]+)\}\n\n\*\*([^*]+)\*\*\n\n\*([^*]+)\*\n\n---/g,
      (_, anchor, label, title) => `## ${label} — ${title} {#${anchor}}`
    );
    docxMd = docxMd.replace(
      /\[\]\{#([^}]+)\}\n\n\*\*([^*]+)\*\*/g,
      (_, anchor, label) => `## ${label} {#${anchor}}`
    );

    // Add YAML metadata header for pandoc
    const docxYaml = [
      '---',
      `title: '${TITLE.replace(/'/g, "''")}'`,
      SUBTITLE ? `subtitle: '${SUBTITLE.replace(/'/g, "''")}'` : null,
      `author: '${AUTHOR.replace(/'/g, "''")}'`,
      '---',
    ].filter(Boolean).join('\n') + '\n\n';

    const docxFile = path.join(OUT_DIR, '.docx-temp.md');
    fs.writeFileSync(docxFile, docxYaml + docxMd);

    const pandocBin = await Pandoc.getBinaryPath();
    execSync(
      `"${pandocBin}" "${docxFile}" -o "${docxOut}" --toc --toc-depth=2`,
      { stdio: 'pipe' }
    );
    fs.unlinkSync(docxFile);

    console.log(`✓ Word built:     ${docxOut}`);

    // Apply manuscript formatting via post-processing
    postProcessDocx(docxOut, TITLE, AUTHOR);
  } catch (err) {
    console.warn(`⚠ DOCX generation failed: ${err.message}`);
  }

  // ── EPUB (reflowable — no page size needed) ─────────────────
  try {
    const epubOut = path.join(OUT_DIR, `${SLUG}.epub`);
    let epubMd = mdContent;
    epubMd = epubMd.replace(/^[\s\S]*?\n---\n\n/, '');
    epubMd = epubMd.replace(/^!\[.*\]\(assets\/cover\.jpg\)$/gm, '');
    epubMd = epubMd.replace(/```{=openxml}[\s\S]*?```\n*/g, '');
    epubMd = epubMd.replace(/```{=latex}[\s\S]*?```\n*/g, '');
    epubMd = epubMd.replace(/^## Contents\n[\s\S]*?^---$/m, '');

    epubMd = epubMd.replace(/```{=html}[\s\S]*?```\n*/g, '');

    epubMd = epubMd.replace(
      /\[\]\{#([^}]+)\}\n\n\*\*([^*]+)\*\*\n\n\*([^*]+)\*\n\n---/g,
      (_, anchor, label, title) => `## ${label} — ${title} {#${anchor}}`
    );
    epubMd = epubMd.replace(
      /\[\]\{#([^}]+)\}\n\n\*\*([^*]+)\*\*/g,
      (_, anchor, label) => `## ${label} {#${anchor}}`
    );

    epubMd = epubMd.trimStart();
    if (!epubMd.startsWith('#')) {
      epubMd = '# Copyright {.unnumbered .unlisted}\n\n' + epubMd;
    }

    const yamlHeader = SUBTITLE
      ? `---\ntitle: '${TITLE.replace(/'/g, "''")}'\nsubtitle: '${SUBTITLE.replace(/'/g, "''")}'\nauthor: '${AUTHOR.replace(/'/g, "''")}'\nlang: en\n---\n\n`
      : `---\ntitle: '${TITLE.replace(/'/g, "''")}'\nauthor: '${AUTHOR.replace(/'/g, "''")}'\nlang: en\n---\n\n`;
    const epubFile = path.join(OUT_DIR, '.epub-temp.md');
    fs.writeFileSync(epubFile, yamlHeader + epubMd);

    const pandocBin = await Pandoc.getBinaryPath();
    const coverArgs = fs.existsSync(COVER) ? `--epub-cover-image="${COVER}"` : '';
    execSync(`"${pandocBin}" "${epubFile}" -o "${epubOut}" --toc --toc-depth=2 --split-level=2 ${coverArgs}`, { stdio: 'pipe' });
    fs.unlinkSync(epubFile);

    console.log(`✓ EPUB built:     ${epubOut}`);

    // Fix epub:type on front matter pages
    postProcessEpub(epubOut);
  } catch (err) {
    console.warn(`⚠ EPUB generation failed: ${err.message}`);
  }

  // ── PDF (pandoc+LaTeX primary, md-to-pdf fallback) ─────────
  const pdfOut = path.join(OUT_DIR, `${SLUG}.pdf`);
  let pdfBuilt = false;

  try {
    let pandocPdfMd = mdContent;
    pandocPdfMd = pandocPdfMd.replace(/^[\s\S]*?\n---\n\n/, '');
    pandocPdfMd = pandocPdfMd.replace(/```{=html}[\s\S]*?```\n*/g, '');
    pandocPdfMd = pandocPdfMd.replace(/^\[\]{#[^}]*}\n*/gm, '');
    pandocPdfMd = pandocPdfMd.replace(/^!\[.*\]\(assets\/cover\.jpg\)$/gm, '');
    pandocPdfMd = pandocPdfMd.replace(/^## Contents\n[\s\S]*?^---$/m, '');
    pandocPdfMd = pandocPdfMd.replace(
      /\[\]\{#([^}]+)\}\n\n\*\*([^*]+)\*\*\n\n\*([^*]+)\*\n\n---/g,
      (_, anchor, label, title) => `## ${label} — ${title} {#${anchor}}`
    );
    pandocPdfMd = pandocPdfMd.replace(
      /\[\]\{#([^}]+)\}\n\n\*\*([^*]+)\*\*/g,
      (_, anchor, label) => `## ${label} {#${anchor}}`
    );

    const pdfTempFile = path.join(OUT_DIR, '.pdf-temp.md');
    fs.writeFileSync(pdfTempFile, pandocPdfMd);

    for (const engine of ['xelatex', 'lualatex', 'pdflatex']) {
      const result = await markdownToPdf(pdfTempFile, pdfOut, {
        pdfEngine: engine,
        toc: true,
        tocDepth: 2,
        metadata: { title: TITLE, subtitle: SUBTITLE, author: AUTHOR },
        variables: {
          'geometry:paperwidth': TRIM.width,
          'geometry:paperheight': TRIM.height,
          'geometry:top': TRIM.margin.top,
          'geometry:bottom': TRIM.margin.bottom,
          'geometry:left': TRIM.margin.left,
          'geometry:right': TRIM.margin.right,
          fontsize: '11pt',
          mainfont: 'Crimson Text',
        },
      });
      if (result.success) {
        console.log(`✓ PDF built:      ${pdfOut} (${engine})`);
        pdfBuilt = true;
        break;
      }
    }
    fs.unlinkSync(pdfTempFile);
  } catch (err) {
    console.warn(`⚠ Pandoc PDF failed: ${err.message}`);
  }

  if (!pdfBuilt) {
    try {
      let pdfMd = mdContent;
      pdfMd = pdfMd.replace(/^[\s\S]*?\n---\n\n/, '');
      pdfMd = pdfMd.replace(/```{=openxml}[\s\S]*?```\n*```{=latex}[\s\S]*?```\n*```{=html}[\s\S]*?```\n*/g, '<div style="page-break-before: always;"></div>\n\n');
      pdfMd = pdfMd.replace(/^\[\]{#[^}]*}\n*/gm, '');
      pdfMd = pdfMd.replace(/^!\[.*\]\(assets\/cover\.jpg\)$/gm, '');
      pdfMd = pdfMd.replace(/^## Contents\n[\s\S]*?^---$/m, '');

      const fullPdfTitle = SUBTITLE ? `${TITLE}: ${SUBTITLE}` : TITLE;
      const pdf = await mdToPdf(
        { content: pdfMd },
        {
          document_title: fullPdfTitle,
          stylesheet: ['https://fonts.googleapis.com/css2?family=Crimson+Text:ital@0;1&display=swap'],
          css: 'body { font-family: "Crimson Text", serif; }',
          pdf_options: {
            width:  TRIM.width,
            height: TRIM.height,
            margin: {
              top:    TRIM.margin.top,
              bottom: TRIM.margin.bottom,
              left:   TRIM.margin.left,
              right:  TRIM.margin.right,
            },
          },
        },
      );
      fs.writeFileSync(pdfOut, pdf.content);
      console.log(`✓ PDF built:      ${pdfOut} (md-to-pdf fallback — no bookmarks)`);
    } catch (err) {
      console.warn(`⚠ PDF generation failed: ${err.message}`);
    }
  }
}

build().catch(err => {
  console.error('✗ Build failed:', err.message);
  process.exit(1);
});
