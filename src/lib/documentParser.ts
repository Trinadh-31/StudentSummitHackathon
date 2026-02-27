import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Use a reliable CDN and version
const PDFJS_VERSION = '5.4.624'; 
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

export async function extractTextFromPDF(file: File): Promise<string> {
  console.log('Extracting text from PDF using version:', pdfjsLib.version);
  const arrayBuffer = await file.arrayBuffer();
  try {
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
    });
    
    // Add a timeout to the loading task
    const pdf = await Promise.race([
      loadingTask.promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('PDF loading timed out. The worker might be blocked.')), 10000))
    ]) as pdfjsLib.PDFDocumentProxy;

    let fullText = '';
    console.log(`PDF loaded successfully: ${pdf.numPages} pages`);
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
    }

    if (!fullText.trim()) {
      throw new Error('No text could be extracted from this PDF. It might be a scanned image or empty.');
    }

    return fullText;
  } catch (error) {
    console.error('PDF.js extraction error:', error);
    let message = 'Failed to parse PDF';
    if (error instanceof Error) {
      if (error.message.includes('worker')) message = 'PDF worker failed to load. This usually happens due to network restrictions or ad-blockers.';
      else if (error.message.includes('timeout')) message = 'PDF loading timed out. Try refreshing the page.';
      else message = error.message;
    }
    throw new Error(message);
  }
}

export async function extractTextFromDocx(file: File): Promise<string> {
  console.log('Extracting text from DOCX...');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

export async function extractText(file: File): Promise<string> {
  console.log('extractText called for:', file.name, file.type);
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractTextFromPDF(file);
  } else if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.toLowerCase().endsWith('.docx')
  ) {
    return extractTextFromDocx(file);
  } else if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
    return file.text();
  }
  throw new Error(`Unsupported file type: ${file.type || 'unknown'}. Please upload PDF, DOCX, or TXT.`);
}
