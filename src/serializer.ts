import { TextDecoder, TextEncoder } from 'util';
import * as vscode from 'vscode';

// Cell block delimiter
const DELIMITER = '\n\n';

function splitCodeBlocks(raw: string): string[] {
  const blocks = [];
  for (const block of raw.split(DELIMITER)) {
    const trimmed_block = block.trim();
    if (trimmed_block.length > 0) {
      blocks.push(trimmed_block);
    }
  }
  return blocks;
}

export class SQLSerializer implements vscode.NotebookSerializer {
  async deserializeNotebook(
    context: Uint8Array,
    _token: vscode.CancellationToken
  ): Promise<vscode.NotebookData> {
    const str = new TextDecoder().decode(context);
    const blocks = splitCodeBlocks(str);

    const cells = blocks.map((query) => {
      const isMarkdown = query.startsWith('/*markdown') && query.endsWith('*/');
      if (isMarkdown) {
        const lines = query.split('\n');
        const innerMarkdown =
          lines.length > 2 ? lines.slice(1, lines.length - 1).join('\n') : '';
        return new vscode.NotebookCellData(
          vscode.NotebookCellKind.Markup,
          innerMarkdown,
          'markdown'
        );
      }

      return new vscode.NotebookCellData(
        vscode.NotebookCellKind.Code,
        query,
        'sql'
      );
    });
    return new vscode.NotebookData(cells);
  }

  async serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken
  ): Promise<Uint8Array> {
    return new TextEncoder().encode(
      data.cells
        .map(({ value, kind }) =>
          kind === vscode.NotebookCellKind.Code
            ? value
            : `/*markdown\n${value}\n*/`
        )
        .join(DELIMITER)
    );
  }
}
