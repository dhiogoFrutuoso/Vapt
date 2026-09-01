import { Project, SyntaxKind, ArrowFunction, CallExpression, VariableDeclaration } from 'ts-morph';

const project = new Project();
project.addSourceFilesAtPaths("c:/Users/seuma/Desktop/PROJETOS/Vapt/apps/api/src/controllers/**/*.ts");

const files = project.getSourceFiles();

for (const sourceFile of files) {
  console.log(`Processing ${sourceFile.getBaseName()}`);
  let changed = false;

  const varDecls = sourceFile.getVariableDeclarations().filter(v => v.isExported());
  
  for (const varDecl of varDecls) {
    const initializer = varDecl.getInitializer();
    if (initializer && initializer.getKind() === SyntaxKind.CallExpression) {
      const callExpr = initializer as CallExpression;
      const expr = callExpr.getExpression();
      
      if (expr.getText() === 'asyncHandler') {
        const args = callExpr.getArguments();
        if (args.length === 1 && args[0].getKind() === SyntaxKind.ArrowFunction) {
          const arrowFunc = args[0] as ArrowFunction;
          const body = arrowFunc.getBody();
          
          if (body.getKind() === SyntaxKind.Block) {
            const bodyText = body.getText();
            const innerCode = bodyText.substring(1, bodyText.length - 1).trim();
            const functionName = varDecl.getName();
            
            const catchBlock = `
  } catch (error: any) {
    console.error('[API Error - ${functionName}]:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Sessão expirada ou inválida." });
    }
    return res.status(500).json({ message: "Erro interno no servidor.", error: error.message || "Erro desconhecido" });
  }
`;
            const newArrowFunc = `async (req: Request, res: Response) => {\n  try {\n    ${innerCode}\n${catchBlock}}`;
            
            varDecl.setInitializer(newArrowFunc);
            changed = true;
          }
        }
      }
    }
  }

  const imports = sourceFile.getImportDeclarations();
  for (const imp of imports) {
    if (imp.getModuleSpecifierValue().includes('asyncHandler')) {
      imp.remove();
      changed = true;
    }
  }

  if (changed) {
    sourceFile.saveSync();
    console.log(`Saved ${sourceFile.getBaseName()}`);
  }
}
