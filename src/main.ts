import * as vscode from 'vscode';
import { SQLNotebookConnections } from './connections';
import { connectToDatabase, deleteConnectionConfiguration } from './commands';
import { Pool } from './driver';
import { activateFormProvider } from './form';
import { SqlLspClient } from './lsp';
import { SLTSerializer, SQLSerializer } from './serializer';
import { SQLNotebookController } from './controller';

export const notebookTypeSQL = 'sql-notebook';
export const notebookTypeSLT = 'slt-notebook';
export const storageKey = 'sqlnotebook-connections';

export const globalConnPool: { pool: Pool | null } = {
  pool: null,
};

export const globalLspClient = new SqlLspClient();

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.registerNotebookSerializer(
      notebookTypeSQL,
      new SQLSerializer()
    )
  );
  context.subscriptions.push(
    vscode.workspace.registerNotebookSerializer(
      notebookTypeSLT,
      new SLTSerializer()
    )
  );
  const connectionsSidepanel = new SQLNotebookConnections(context);
  vscode.window.registerTreeDataProvider(
    'sqlnotebook-connections',
    connectionsSidepanel
  );

  activateFormProvider(context);

  context.subscriptions.push(new SQLNotebookController());

  vscode.commands.registerCommand(
    'sqlnotebook.deleteConnectionConfiguration',
    deleteConnectionConfiguration(context, connectionsSidepanel)
  );

  vscode.commands.registerCommand('sqlnotebook.refreshConnectionPanel', () => {
    connectionsSidepanel.refresh();
  });
  vscode.commands.registerCommand(
    'sqlnotebook.connect',
    connectToDatabase(context, connectionsSidepanel)
  );
}

export function deactivate() { }
