import * as vscode from 'vscode';
import { Row, TabularResult } from './driver';

export function resultToMarkdownTable(result: TabularResult): string {
  if (result.length < 1) {
    return '*Empty Results Table*';
  }

  const maxRows = getMaxRows();
  if (result.length > maxRows) {
    result = result.slice(0, maxRows);
    result.push(
      Object.fromEntries(Object.entries(result).map((pair) => [pair[0], '...']))
    );
  }

  return `
  <div>
  <style scoped>
    table {
      font-family: ${getFontFamily()}
    }
    table tbody tr:not(:first-child) td {
      border-top: none;
      padding-top: 3px;
    }
    table tbody tr:not(:last-child) td {
      border-bottom: none;
      padding-bottom: 3px;
    }
  </style>
  <table>
    <thead>
      ${htmlHeaderRow(result[0])}
    </thead>
    <tbody>
      ${result.map(htmlBodyRow).join('\n')}
    </tbody>
  </table>
  </div>`;
}

function getMaxRows(): number {
  const fallbackMaxRows = 25;
  const maxRows: number | undefined = vscode.workspace
    .getConfiguration('SQLNotebook')
    .get('maxResultRows');
  return maxRows ?? fallbackMaxRows;
}

function htmlHeaderRow(obj: Row): string {
  const content = Object.keys(obj)
    .map(stringifyCell)
    .map(escapeCell)
    .map((colName) => `<th>${colName}</th>`)
    .join();
  return `<tr>${content}</tr>`;
}

function htmlBodyRow(row: Row): string {
  const content = Object.entries(row)
    .map((pair) => pair[1])
    .map(stringifyCell)
    .map(escapeCell)
    .map((val) => `<td>${val}</td>`)
    .join();
  return `<tr>${content}</tr>`
}

function stringifyCell(a: any): string {
  try {
    // serialize buffers as hex strings
    if (Buffer.isBuffer(a)) {
      return `0x${a.toString('hex')}`;
    }
    // attempt to serialize all remaining "object" values as JSON
    if (typeof a === 'object') {
      return JSON.stringify(a);
    }
    if (typeof a === 'string') {
      return a.replace(/[\n\r]+/g, ' ');
    }
  } catch {
  }
  return `${a}`;
}

function escapeCell(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '&apos;')
    .replace(/ /g, '&nbsp;');
}

function getFontFamily(): string {
  const editorConfig = vscode.workspace.getConfiguration('editor');
  const fontFamily = editorConfig.get('fontFamily');
  return typeof fontFamily === 'string' ? fontFamily : 'monospace';
}
