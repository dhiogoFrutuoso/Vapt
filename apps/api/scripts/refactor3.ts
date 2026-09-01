import { Project, SyntaxKind, FunctionDeclaration, VariableDeclaration, ArrowFunction, CallExpression } from 'ts-morph';

const project = new Project();
project.addSourceFilesAtPaths("c:/Users/seuma/Desktop/PROJETOS/Vapt/apps/api/src/controllers/**/*.ts");

const files = project.getSourceFiles();

const catchBlockTemplate = (functionName: string) => `
  } catch (error: any) {
    console.error('[API Error - ${functionName}]:', error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ ok: false, error: 'Dados invalidos', details: error.issues });
    }
    
    if (error.status) {
      return res.status(error.status).json({ ok: false, error: error.message, message: error.message });
    }

    if (error.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Registro duplicado', message: 'Registro duplicado' });
    }

    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Sessão expirada ou inválida." });
    }
    
    return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
  }
`;

for (const sourceFile of files) {
  console.log(`Processing ${sourceFile.getBaseName()}`);
  let changed = false;

  const funcDecls = sourceFile.getFunctions().filter(f => f.isExported());
  for (const funcDecl of funcDecls) {
    if (funcDecl.isAsync()) {
      const body = funcDecl.getBody();
      if (body && body.getKind() === SyntaxKind.Block) {
        const bodyText = body.getText();
        
        let innerCode = bodyText.substring(1, bodyText.length - 1).trim();
        if (innerCode.startsWith('try {') && innerCode.includes('} catch (error: any) {')) {
           const match = innerCode.match(/^try\s*\{([\s\S]*?)\}\s*catch\s*\(error:\s*any\)\s*\{[\s\S]*?\}$/);
           if (match) {
             innerCode = match[1].trim();
           }
        }

        const functionName = funcDecl.getName() || 'anonymous';
        const newBody = `{\n  try {\n    ${innerCode}\n${catchBlockTemplate(functionName)}}`;
        funcDecl.setBodyText(newBody.substring(1, newBody.length - 1));
        changed = true;
      }
    }
  }

  const varDecls = sourceFile.getVariableDeclarations().filter(v => v.isExported());
  for (const varDecl of varDecls) {
    const initializer = varDecl.getInitializer();
    if (initializer && initializer.getKind() === SyntaxKind.ArrowFunction) {
      const arrowFunc = initializer as ArrowFunction;
      const body = arrowFunc.getBody();
      
      if (body.getKind() === SyntaxKind.Block) {
        const bodyText = body.getText();
        
        let innerCode = bodyText.substring(1, bodyText.length - 1).trim();
        if (innerCode.startsWith('try {') && innerCode.includes('} catch (error: any) {')) {
           const match = innerCode.match(/^try\s*\{([\s\S]*?)\}\s*catch\s*\(error:\s*any\)\s*\{[\s\S]*?\}$/);
           if (match) {
             innerCode = match[1].trim();
           }
        }

        const functionName = varDecl.getName();
        const newArrowFunc = `async (req: Request, res: Response) => {\n  try {\n    ${innerCode}\n${catchBlockTemplate(functionName)}}`;
        varDecl.setInitializer(newArrowFunc);
        changed = true;
      }
    }
  }

  if (changed) {
    sourceFile.saveSync();
    console.log(`Saved ${sourceFile.getBaseName()}`);
  }
}
