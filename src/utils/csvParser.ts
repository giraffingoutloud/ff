/**
 * CSV Parser Utility
 * Handles parsing of canonical CSV data files
 */

export interface ParsedCSVRow {
  [key: string]: string;
}

/**
 * Parse CSV content into array of objects
 */
export function parseCSV(csvContent: string): ParsedCSVRow[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  // Parse headers
  const headers = parseCSVLine(lines[0]).map(h => 
    h.trim()
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/^\uFEFF/, '') // Remove BOM if present
  );
  
  const rows: ParsedCSVRow[] = [];
  
  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    
    const row: ParsedCSVRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index]?.trim().replace(/^["']|["']$/g, '') || '';
    });
    
    rows.push(row);
  }
  
  return rows;
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar: string | null = null;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (!inQuotes && (char === '"' || char === "'")) {
      // Starting a quoted field
      inQuotes = true;
      quoteChar = char;
    } else if (inQuotes && char === quoteChar) {
      if (nextChar === quoteChar) {
        // Escaped quote (doubled)
        current += char;
        i++; // Skip next char
      } else {
        // End of quoted field
        inQuotes = false;
        quoteChar = null;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  if (current || line.endsWith(',')) {
    result.push(current);
  }
  
  return result;
}

/**
 * Load and parse CSV file from path
 */
export async function loadCSVFile(path: string): Promise<ParsedCSVRow[]> {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load CSV: ${response.status} ${response.statusText}`);
    }
    
    const content = await response.text();
    return parseCSV(content);
  } catch (error) {
    console.error(`Error loading CSV file ${path}:`, error);
    throw error;
  }
}