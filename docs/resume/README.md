# Resume Documentation & Templates

This directory provides resume templates and instructions for managing ATS-optimized resumes.

> **🔒 Privacy & Git Notice:**  
> All personal resume files (`*.pdf`, `*.html`, `*.md` other than templates) in this directory are **ignored by Git** via [`.gitignore`](file:///home/gui/projects/job-engine/.gitignore) to protect personal identifiable information (PII).  
> They remain fully accessible locally on disk for your local scripts, tools, and AI agents.

---

## 📁 Files & Templates

- **[`resume.template.md`](file:///home/gui/projects/job-engine/docs/resume/resume.template.md)**: Clean Markdown template with placeholder sections for personal info, summary, skills, experience, projects, and education.
- **[`resume_1page.template.html`](file:///home/gui/projects/job-engine/docs/resume/resume_1page.template.html)**: Pixel-perfect, print-to-PDF ready HTML resume template. Designed to print onto a single page (Letter / A4) with modern typography (`Inter`) and CSS print media queries.

---

## 🚀 Quick Start: Setting Up Your Resume

1. **Create your personal Markdown resume**:
   ```bash
   cp docs/resume/resume.template.md docs/resume/my_resume.md
   ```
   Fill in your details, background, and project impact.

2. **(Optional) Create your personal 1-page HTML resume**:
   ```bash
   cp docs/resume/resume_1page.template.html docs/resume/my_resume_1page.html
   ```
   Edit the HTML file with your information.

---

## 🖨️ How to Export HTML to 1-Page PDF

1. **Open the HTML File**:
   - Double-click your `.html` resume or open it in Google Chrome / Brave / Edge / Safari.
2. **Open Print Dialog**:
   - Press `Ctrl + P` (Linux/Windows) or `Cmd + P` (macOS).
3. **Print Settings**:
   - **Destination**: *Save as PDF*
   - **Paper Size**: *Letter* (or *A4*)
   - **Margins**: *Default* (the stylesheet includes custom `@page` margin control)
   - **Options**: Ensure *Background graphics* is checked.
4. **Save**:
   - Click **Save** (e.g. `docs/resume/my_resume.pdf`).

---

## 🤖 AI Agents & Local Code Access

Local tools and AI agents (such as Antigravity, Cursor, Claude Code, or Python parsing scripts) read directly from your local filesystem. They can read and edit your personal local resume files seamlessly without requiring them to be committed to version control.
