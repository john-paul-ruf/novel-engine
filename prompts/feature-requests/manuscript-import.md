I want to be able to import an existing manuscript — a single Markdown file or a DOCX — and have Novel Engine split it into chapters and set up the full book structure. Not everyone starts from scratch with Spark. Some people have a 60,000-word draft sitting in Google Docs and want to run it through the editorial pipeline starting at First Read.

The import should detect chapter breaks (headings, "Chapter N" patterns, scene breaks), create the chapter directories with draft.md files, populate about.json from whatever metadata it can infer, and drop the user at whatever pipeline phase makes sense (probably first-draft complete if there's enough content). If the chapter detection is ambiguous, show a preview and let me adjust the splits before committing.

A button in the book creation flow like "Import existing manuscript" alongside the current "Create new book" would be the natural place for this.

