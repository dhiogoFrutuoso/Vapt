import { Project, SyntaxKind, FunctionDeclaration } from 'ts-morph';

const project = new Project();
project.addSourceFilesAtPaths("c:/Users/seuma/Desktop/PROJETOS/Vapt/apps/api/src/controllers/**/*.ts");

const files = project.getSourceFiles();

for (const sourceFile of files) {
  console.log(`Processing FunctionDeclarations in ${sourceFile.getBaseName()}`);
  let changed = false;

  const funcDecls = sourceFile.getFunctions().filter(f => f.isExported());
  
  for (const funcDecl of funcDecls) {
    if (funcDecl.isAsync()) {
      const body = funcDecl.getBody();
      if (body && body.getKind() === SyntaxKind.Block) {
        const bodyText = body.getText();
        
        // Skip if already wrapped in try-catch at top level
        if (bodyText.includes('try {') && bodyText.includes('catch (error')) {
          continue;
        }

        const innerCode = bodyText.substring(1, bodyText.length - 1).trim();
        const functionName = funcDecl.getName();
        
        const catchBlock = `
  } catch (error: any) {
    console.error('[API Error - ${functionName}]:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Sessão expirada ou inválida." });
    }
    return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
  }
`;
        const newBody = `{\n  try {\n    ${innerCode}\n${catchBlock}}`;
        funcDecl.setBodyText(newBody.substring(1, newBody.length - 1)); // setBodyText expects the inside of the block
        changed = true;
      }
    }
  }

  if (changed) {
    sourceFile.saveSync();
    console.log(`Saved FunctionDeclarations in ${sourceFile.getBaseName()}`);
  }
}
