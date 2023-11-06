import * as vscode from 'vscode';
import { ExecutionResult } from './driver';
import { globalConnPool, notebookTypeSLT, notebookTypeSQL } from './main';
import { resultToMarkdownTable } from './markdown';

const { text, json } = vscode.NotebookCellOutputItem;

export class SQLNotebookController {
  private _sqlExecutionOrder = 0;
  private _sltExecutionOrder = 0;

  constructor() {
    const sqlController = vscode.notebooks.createNotebookController(
      'sql-notebook-executor',
      notebookTypeSQL,
      'SQL Notebook'
    );
    sqlController.supportedLanguages = ['sql'];
    sqlController.supportsExecutionOrder = true;
    sqlController.executeHandler = this._execute.bind(this);

    const sltController = vscode.notebooks.createNotebookController(
      'slt-notebook-executor',
      notebookTypeSLT,
      'SLT Notebook'
    );
    sltController.supportedLanguages = ['sql']; // TODO: currently we parse slt files to `sql` cells
    sltController.supportsExecutionOrder = true;
    sltController.executeHandler = this._execute.bind(this);
  }

  private async _execute(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    controller: vscode.NotebookController
  ): Promise<void> {
    for (let cell of cells) {
      // run each cell sequentially, awaiting its completion
      await this.doExecution(cell, notebook, controller);
    }
  }

  dispose() {
    globalConnPool.pool?.end();
  }

  private async doExecution(
    cell: vscode.NotebookCell,
    notebook: vscode.NotebookDocument,
    controller: vscode.NotebookController
  ): Promise<void> {
    const execution = controller.createNotebookCellExecution(cell);
    execution.start(Date.now());

    if (notebook.notebookType === notebookTypeSQL) {
      execution.executionOrder = ++this._sqlExecutionOrder;
    } else if (notebook.notebookType === notebookTypeSLT) {
      execution.executionOrder = ++this._sltExecutionOrder;
    } else {
      console.error(`something strange happened, notebook type: ${notebook.notebookType}`);
      writeErr(execution, 'Internal error happened');
      return;
    }

    const rawQuery = notebook.notebookType === notebookTypeSQL ? cell.document.getText() : parseSLTCell(cell);

    if (!globalConnPool.pool) {
      writeErr(
        execution,
        'No active connection found. Configure database connections in the SQL Notebook sidepanel.'
      );
      return;
    }
    const conn = await globalConnPool.pool.getConnection();
    execution.token.onCancellationRequested(() => {
      console.debug('got cancellation request');
      (async () => {
        conn.release();
        conn.destroy();
        writeErr(execution, 'Query cancelled');
      })();
    });

    console.debug('executing query', { query: rawQuery });
    let result: ExecutionResult;
    try {
      result = await conn.query(rawQuery);
      console.debug('sql query completed', result);
      conn.release();
    } catch (err) {
      console.debug('sql query failed', err);
      // @ts-ignore
      writeErr(execution, err.message);
      conn.release();
      return;
    }

    if (typeof result === 'string') {
      writeSuccess(execution, [[text(result)]]);
      return;
    }

    if (
      result.length === 0 ||
      (result.length === 1 && result[0].length === 0)
    ) {
      writeSuccess(execution, [[text('Successfully executed query')]]);
      return;
    }

    writeSuccess(
      execution,
      result.map((item) => {
        const outputs = [text(resultToMarkdownTable(item), 'text/markdown')];
        if (outputJsonMimeType()) {
          outputs.push(json(item));
        }
        return outputs;
      })
    );
  }
}

function writeErr(execution: vscode.NotebookCellExecution, err: string) {
  execution.replaceOutput([
    new vscode.NotebookCellOutput([text(err)]),
  ]);
  execution.end(false, Date.now());
}

function writeSuccess(
  execution: vscode.NotebookCellExecution,
  outputs: vscode.NotebookCellOutputItem[][]
) {
  execution.replaceOutput(
    outputs.map((items) => new vscode.NotebookCellOutput(items))
  );
  execution.end(true, Date.now());
}

function parseSLTCell(cell: vscode.NotebookCell): string {
  let queries: string[] = [];

  const lines = cell.document.getText().split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length === 0) continue;
    if (lines[i].startsWith('#')) continue;

    let tokens = lines[i].split(/\s+/);
    if (tokens.length === 0) continue;

    switch (tokens[0]) {
      case 'statement': {
        let query = '';
        while (i + 1 < lines.length && lines[i + 1].length > 0) {
          query += lines[i + 1];
          ++i;
        }
        if (!query.trimEnd().endsWith(';')) {
          query += ';'
        }
        queries.push(query);
        break;
      }
      case 'query': {
        let query = '';
        while (i + 1 < lines.length && lines[i + 1].length > 0 && lines[i + 1] !== '----') {
          query += lines[i + 1];
          ++i;
        }
        if (!query.trimEnd().endsWith(';')) {
          query += ';'
        }
        queries.push(query);
        break;
      }
      case 'include':
      case 'halt':
      case 'subtest':
      case 'sleep':
      case 'skipif':
      case 'onlyif':
      case 'connection':
      case 'system':
      case 'control':
      case 'hash-threshold': {
        console.warn(`ignored sqllogictest command \`${tokens.join(' ')}\``);
        break;
      }
      default: {
        console.error(`unrecognized sqllogictest command \`${tokens.join(' ')}`);
      }
    }
  }

  return queries.join('\n');
}

function outputJsonMimeType(): boolean {
  return (
    vscode.workspace.getConfiguration('SQLNotebook').get('outputJSON') ?? false
  );
}
