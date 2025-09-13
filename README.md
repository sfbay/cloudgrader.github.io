# PSD Grading Tool

Automated grading tool for Adobe Photoshop assignments. Designed for educators to streamline assessment of student PSD files, including Canvas LMS integration and FERPA anonymization.

## Features

- **Batch grading** of PSD and ZIP files (Canvas ZIP supported)
- **Customizable criteria**: filename pattern, dimensions, color mode, layer count, required layers, resolution, font requirements
- **Canvas integration**: auto-extracts user IDs, flags late submissions, exports Canvas-ready CSV
- **FERPA anonymization**: sequential, random, or Canvas-based anonymization
- **Detailed feedback**: per-file breakdown, summary statistics, color-coded scores
- **Modern UI**: responsive, easy to use, no installation required for students

## Usage

1. **Upload files**: Drag and drop Canvas ZIP or individual PSD/ZIP files.
2. **Set grading criteria**: Configure filename patterns, technical requirements, fonts, etc.
3. **Process files**: Click "Generate Grade Report" to analyze and grade.
4. **Review results**: View summary stats and detailed feedback.
5. **Export grades**: Download CSV for Canvas import or general use.

## Canvas Integration

- Upload Canvas ZIP directly—no renaming needed.
- Canvas user IDs and late submissions are detected automatically.
- Exported CSV matches Canvas gradebook format for seamless import.

## FERPA Compliance

- Enable anonymization for privacy compliance if grading on a remote server.
- Choose anonymization method: Canvas IDs, sequential, or random.

## Installation

1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Start the server:
   ```sh
   npm start
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Requirements

- Node.js 18+ recommended
- macOS, Windows, or Linux

## Folder Structure

- `src/server.js` – Express server, file processing logic
- `src/public/` – Frontend (HTML, CSS, JS)
- `src/utils/file-processor.js` – File analysis and grading logic
- `uploads/` – Uploaded files (temporary storage)

## Support

For questions, suggestions, or contributions, please contact the project maintainer or open an issue.

---

**Academic Use:**  
This tool is intended for faculty and staff in design, art, or digital media programs seeking efficient, consistent, and privacy-conscious grading of Photoshop
