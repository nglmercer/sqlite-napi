import { z } from 'zod';
import { zodToTs, printNode,createAuxiliaryTypeStore,ZodToTsOptions } from 'zod-to-ts';
import * as fs from 'fs';

// 1. IMPORTAR EL JSON
// Puedes usar un import dinámico o fs.readFileSync
const rawSchema = JSON.parse(fs.readFileSync('./oauthSchema.json', 'utf-8'));
const zodSchema = z.fromJSONSchema(rawSchema);

// 3. CONVERTIR ZOD A TYPESCRIPT (AST)
// El segundo argumento es el nombre del tipo (string)
// El tercer argumento es el objeto de opciones ({} para evitar el error)
const auxiliaryTypeStore = createAuxiliaryTypeStore()

function generateType(zodSchema: z.ZodType, options: ZodToTsOptions) {
  const { node } = zodToTs(zodSchema, options);
  return `export type ${rawSchema.name || 'MyType'} = ${printNode(node)};`;
}

console.log(generateType(zodSchema, {auxiliaryTypeStore}));