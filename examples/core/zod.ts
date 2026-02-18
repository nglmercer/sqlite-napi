import { z } from 'zod';
import type { SerializedSchema } from './index';

export function createZodFromJSON(json: SerializedSchema) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const col of json.columns) {
    let validator: z.ZodTypeAny;

    // Mapeo de tipos SQL/Internal a Zod
    switch (col.type.toUpperCase()) {
      case 'TEXT':
      case 'VARCHAR':
        validator = z.string();
        break;
      case 'UUID':
        validator = z.string().uuid();
        break;
      case 'INTEGER':
      case 'REAL':
        validator = z.number();
        break;
      case 'BOOLEAN':
        validator = z.boolean();
        break;
      case 'DATETIME':
      case 'DATE':
        validator = z.date();
        break;
      default:
        validator = z.any();
    }

    // Aplicar restricciones basadas en el JSON
    if (!col.notNull && !col.primaryKey) {
      validator = validator.nullable().optional();
    }

    if (col.defaultValue !== undefined) {
      // Evitar aplicar default si es una función SQL como (CURRENT_TIMESTAMP)
      if (!(typeof col.defaultValue === 'string' && col.defaultValue.startsWith('('))) {
        validator = validator.default(col.defaultValue);
      }
    }

    shape[col.name] = validator;
  }

  return z.object(shape);
}