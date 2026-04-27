import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import axios from 'axios';
import { Collection, Item, ItemGroup, HeaderDefinition, Url } from 'postman-collection';

const ROUTES_DIR = path.join(__dirname, '../src/Routes');
const CONTROLLERS_DIR = path.join(__dirname, '../src/controllers');
const VALIDATION_DIR = path.join(__dirname, '../src/validation');
const OUTPUT_FILE = path.join(__dirname, '../postman_collection.json');
const DEBUG_FILE = path.join(__dirname, '../debug_output.txt');

interface RouteInfo {
  method: string;
  path: string;
  controller: string;
  middleware: string[];
}

const debugLines: string[] = [];
const debug = (line: string) => {
  debugLines.push(line);
};

// ---------------- ROUTE PARSER ----------------
function parseRoutesFile(filePath: string): RouteInfo[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const routes: RouteInfo[] = [];

  for (const line of lines) {
    const match = line.match(/\.(\w+)\(["']([^"']+)["']\s*,\s*(.+)\)/);
    if (!match) continue;

    const method = match[1].toUpperCase();
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) continue;

    const routePath = match[2];
    const rest = match[3].split(',').map(s => s.trim());

    const controller = rest.pop()?.replace(/\w+Controller\./, '') || "";
    const middleware = rest.filter(Boolean);

    routes.push({ method, path: routePath, controller, middleware });
  }

  return routes;
}

// ---------------- FIND SCHEMA ----------------
function findSchemaInController(controllerName: string, controllerFile: string): string | undefined {
  if (!fs.existsSync(controllerFile)) return;

  const content = fs.readFileSync(controllerFile, 'utf-8');

  const regex = new RegExp(`export const ${controllerName}\\s*=`, 'g');
  const match = regex.exec(content);
  if (!match) return;

  const start = content.indexOf('{', match.index);
  let count = 1;
  let i = start + 1;

  while (count > 0 && i < content.length) {
    if (content[i] === '{') count++;
    else if (content[i] === '}') count--;
    i++;
  }

  const body = content.substring(start, i);
  // Match any schema.validate(...) or JoiSchema.validate(...)
  const schemaMatch = body.match(/(\w+Schema)\.validate/);

  return schemaMatch ? schemaMatch[1] : undefined;
}

// ---------------- BASE PATH ----------------
function getBasePaths() {
  const indexFile = path.join(ROUTES_DIR, 'index.ts');
  if (!fs.existsSync(indexFile)) return {};
  const content = fs.readFileSync(indexFile, 'utf-8');

  const basePaths: Record<string, string> = {};
  const regex = /router\.use\(["']([^"']+)["']\s*,\s*(\w+)Router\)/g;

  let match;
  while ((match = regex.exec(content)) !== null) {
    basePaths[match[2]] = match[1];
  }

  return basePaths;
}

function generateSampleFromSchemaObject(schemaDesc: any, prefix = ""): { sample: any, validation: string } {
  let sample: any = {};
  let validation = "";

  if (schemaDesc.type === "object" && schemaDesc.keys) {
    for (const [key, details] of Object.entries<any>(schemaDesc.keys)) {
      const isRequired = details.flags?.presence === "required";
      const fullPath = prefix ? `${prefix}.${key}` : key;
      validation += `| ${fullPath} | ${details.type} | ${isRequired ? "Required" : "Optional"} |\n`;

      if (details.type === "object") {
        const nested = generateSampleFromSchemaObject(details, fullPath);
        sample[key] = nested.sample;
        validation += nested.validation;
      } else if (details.type === "array") {
        sample[key] = [];
        if (details.items && details.items.length > 0) {
          const itemSchema = details.items[0];
          if (itemSchema.type === "object") {
            const nested = generateSampleFromSchemaObject(itemSchema, `${fullPath}[]`);
            sample[key].push(nested.sample);
            validation += nested.validation;
          } else {
            sample[key] = [itemSchema.type === "string" ? "sample_string" : 123];
          }
        }
      } else if (details.type === "alternatives") {
        const objectMatch = details.matches?.find((m: any) => m.schema?.type === "object");
        if (objectMatch) {
          const nested = generateSampleFromSchemaObject(objectMatch.schema, fullPath);
          sample[key] = nested.sample;
          validation += nested.validation;
        } else if (details.matches && details.matches.length > 0) {
          sample[key] = `sample_${details.matches[0].schema?.type || 'alt'}`;
        }
      } else if (details.type === "string") {
        if (key.toLowerCase().includes("email")) sample[key] = "test@example.com";
        else if (key.toLowerCase().includes("password")) sample[key] = "Password123!";
        else sample[key] = `sample_${key}`;
      } else if (details.type === "number") {
        if (key === "page") sample[key] = 1;
        else if (key === "limit") sample[key] = 10;
        else sample[key] = 123;
      } else if (details.type === "boolean") {
        sample[key] = true;
      } else if (details.type === "any") {
        sample[key] = "sample_any";
      } else {
        sample[key] = "";
      }
    }
  }

  return { sample, validation };
}

// Global cache for validation schemas
let globalValidation: any = null;

function generateSampleFromSchema(schemaName: string): { sample: any, validation: string } | null {
  if (!globalValidation) {
    const validationIndex = path.join(VALIDATION_DIR, 'index.ts');
    if (fs.existsSync(validationIndex)) {
      try {
        globalValidation = require(validationIndex);
      } catch (e: any) {
        debug(`Error requiring validation index: ${e.message}`);
      }
    }
  }

  if (globalValidation && globalValidation[schemaName] && typeof globalValidation[schemaName].describe === 'function') {
    const schemaDesc = globalValidation[schemaName].describe();
    const result = generateSampleFromSchemaObject(schemaDesc);
    result.validation = "\n\n### Validation Rules\n| Field | Type | Requirement |\n|---|---|---|\n" + result.validation;
    return result;
  }

  return null;
}

// ---------------- FORMAT TITLE ----------------
function formatSchemaToTitle(schemaName: string): string {
  let name = schemaName.replace(/Schema$/, '');
  name = name.replace(/([A-Z])/g, ' $1');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ---------------- GENERATE NAME ----------------
function generateReadableName(route: RouteInfo, schemaName?: string): string {
  if (schemaName) return formatSchemaToTitle(schemaName);

  const actionMap: any = {
    POST: "Create",
    GET: "Get",
    PUT: "Update",
    DELETE: "Delete"
  };

  const action = actionMap[route.method] || route.method;
  const lastPart = route.path.split('/').filter(Boolean).pop() || "Item";

  return `${action} ${lastPart.charAt(0).toUpperCase() + lastPart.slice(1)}`;
}

// ---------------- SYNC TO POSTMAN ----------------
async function getExistingPostmanCollection(): Promise<any> {
  const apiKey = process.env.POSTMAN_API_KEY;
  const collectionUid = process.env.POSTMAN_COLLECTION_UID;
  if (!apiKey || !collectionUid) return null;
  try {
    const response = await axios.get(`https://api.getpostman.com/collections/${collectionUid}`, {
      headers: { 'X-Api-Key': apiKey }
    });
    return response.data.collection;
  } catch (error) {
    return null;
  }
}

function extractExistingRequests(collectionJSON: any): Record<string, any> {
  const requests: Record<string, any> = {};
  if (!collectionJSON || !collectionJSON.item) return requests;
  const extract = (items: any[]) => {
    for (const item of items) {
      if (item.item) extract(item.item);
      else if (item.request && item.request.url) {
        const method = item.request.method;
        const pathArr = item.request.url.path || [];
        const path = typeof pathArr === 'string' ? pathArr : pathArr.join('/');
        requests[`${method} /${path}`] = item.request;
      }
    }
  };
  extract(collectionJSON.item);
  return requests;
}

function mergeDeep(target: any, source: any) {
  if (typeof target !== 'object' || target === null) return source;
  if (typeof source !== 'object' || source === null) return target;
  if (Array.isArray(target) && Array.isArray(source)) return source;
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (source[key] instanceof Object && key in target) {
        target[key] = mergeDeep(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
  return target;
}

async function syncToPostman(collectionJSON: any) {
  const apiKey = process.env.POSTMAN_API_KEY;
  const collectionUid = process.env.POSTMAN_COLLECTION_UID;

  if (!apiKey || !collectionUid) {
    console.log("\n⚠️  Postman API Key or Collection UID missing in .env. Skipping cloud sync.");
    console.log("💡 To enable sync, add POSTMAN_API_KEY and POSTMAN_COLLECTION_UID to your .env file.");
    return;
  }

  try {
    console.log(`\nSyncing to Postman Cloud (UID: ${collectionUid})...`);

    await axios.put(
      `https://api.getpostman.com/collections/${collectionUid}`,
      { collection: collectionJSON },
      {
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log("🚀 Postman collection synced successfully with Postman Cloud!");
  } catch (error: any) {
    console.error("❌ Failed to sync with Postman API:");
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Message: ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`   Error: ${error.message}`);
    }
  }
}

// ---------------- MAIN ----------------
async function main() {
  const collection = new Collection({
    info: {
      name: "Delvoura API",
      description: {
        content: "Auto generated API collection",
        type: "text/plain"
      }
    }
  });

  // @ts-ignore
  collection.variables.add({ key: "BASE_URL", value: `http://localhost:${process.env.PORT || 5000}` });
  // @ts-ignore
  collection.variables.add({ key: "TOKEN", value: "" });

  const existingCollection = await getExistingPostmanCollection();
  const existingRequests = extractExistingRequests(existingCollection);
  if (existingCollection) console.log("☁️ Successfully fetched existing collection from Postman Cloud to preserve dynmaic body changes!");

  const basePaths = getBasePaths();
  debug(`Base paths found: ${JSON.stringify(basePaths)}`);

  for (const [routerName, basePath] of Object.entries(basePaths)) {
    const routerFile = path.join(ROUTES_DIR, `${routerName}.ts`);
    if (!fs.existsSync(routerFile)) {
      debug(`Skipping router ${routerName} because file was not found`);
      continue;
    }

    const routes = parseRoutesFile(routerFile);
    debug(`Processing router: ${routerName} at ${basePath}`);
    debug(`Found ${routes.length} routes in ${routerName}`);
    const hasJwt = routes.some(r => r.middleware.some(m => m.toLowerCase().includes('jwt') || m.toLowerCase().includes('authmiddleware')));

    const folder: ItemGroup<Item> = new ItemGroup({
      name: routerName.toUpperCase(),
      description: {
        content: `Routes for ${routerName}`,
        type: "text/plain"
      }
    });

    // ✅ Folder level TOKEN
    if (hasJwt) {
      (folder as any).auth = {
        type: "bearer",
        bearer: [
          { key: "TOKEN", value: "{{TOKEN}}", type: "string" }
        ]
      };
    }

    collection.items.add(folder as any);

    for (const route of routes) {
      debug(`  Processing route: ${route.method} ${route.path}`);
      
      // Try multiple possible controller locations
      const possibleControllerFiles = [
        path.join(CONTROLLERS_DIR, routerName, 'index.ts'),
        path.join(CONTROLLERS_DIR, `${routerName}.controller.ts`),
        path.join(CONTROLLERS_DIR, 'index.ts')
      ];

      let schemaName: string | undefined;
      for (const file of possibleControllerFiles) {
        schemaName = findSchemaInController(route.controller, file);
        if (schemaName) break;
      }

      if (schemaName) debug(`    Found schema: ${schemaName} for controller: ${route.controller}`);

      const result = schemaName ? generateSampleFromSchema(schemaName) : null;

      const headers: HeaderDefinition[] = [];
      let body: any = undefined;
      // URL Construction and Path Parameters (params)
      const urlPath = route.path;
      const cleanBasePath = basePath.replace(/^\//, '');
      const cleanUrlPath = urlPath.replace(/^\//, '');
      const fullPath = [cleanBasePath, cleanUrlPath].filter(Boolean).join('/');
      const fullUrlStr = `{{BASE_URL}}/${fullPath}`;
      const url = new Url(fullUrlStr);

      const pathKey = `${route.method} /${fullPath.replace(/:(\w+)/g, ':$1')}`;
      const existingReq = existingRequests[pathKey];

      const pathParams = fullPath.match(/:(\w+)/g) || [];
      pathParams.forEach((param: any) => {
        const key = param.substring(1);
        let val = `sample_${key}`;
        if (existingReq && existingReq.url && existingReq.url.variable) {
          const extVar = existingReq.url.variable.find((v: any) => v.key === key);
          if (extVar && extVar.value) val = extVar.value;
        }
        // @ts-ignore
        url.variables.add({ key, value: val });
      });

      // Body Construction (raw JSON vs Formdata)
      if (route.method !== 'GET') {
        let mergedSample = result?.sample || {};
        let existingJson: any = {};

        if (existingReq && existingReq.body) {
          if (existingReq.body.mode === 'raw' && existingReq.body.raw) {
            try { existingJson = JSON.parse(existingReq.body.raw); } catch (e) { }
          } else if (existingReq.body.mode === 'formdata' && Array.isArray(existingReq.body.formdata)) {
            existingReq.body.formdata.forEach((field: any) => {
              if (field.type === 'text') {
                try { existingJson[field.key] = JSON.parse(field.value); }
                catch (e) { existingJson[field.key] = field.value; }
              }
            });
          }
        }
        
        mergedSample = mergeDeep(mergedSample, existingJson);

        if (Object.keys(mergedSample).length > 0 || (existingReq && existingReq.body)) {
          const isFormData = route.middleware.some(m => m.toLowerCase().includes('upload'));
          if (isFormData) {
            body = {
              mode: 'formdata',
              formdata: Object.entries(mergedSample).map(([key, value]) => {
                if (key.toLowerCase().includes('photo') || key.toLowerCase().includes('image') || key.toLowerCase().includes('file')) {
                  return { key, type: "file", src: [] };
                }
                return { key, value: typeof value === 'object' ? JSON.stringify(value) : String(value), type: "text" };
              })
            };
          } else {
            headers.push({ key: "Content-Type", value: "application/json" });
            body = {
              mode: 'raw',
              raw: JSON.stringify(mergedSample, null, 2)
            };
          }
        }
      }

      // Query Parameters
      if (route.method === 'GET' || route.method === 'DELETE') {
        const queryParams = result?.sample || {};
        
        // Merge with existing query params from cloud
        if (existingReq && existingReq.url && Array.isArray(existingReq.url.query)) {
          existingReq.url.query.forEach((q: any) => {
             if (q.key && q.value) queryParams[q.key] = q.value;
          });
        }

        for (const [key, value] of Object.entries(queryParams)) {
          if (key === 'id' && urlPath.includes(':id')) continue;
          if (Array.isArray(value)) {
            for (const item of value) {
              url.addQueryParams([{ key: key, value: String(item) }]);
            }
          } else {
            let val = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
            url.addQueryParams([{ key: key, value: val }]);
          }
        }
      } else if (existingReq && existingReq.url && Array.isArray(existingReq.url.query)) {
        // For non-GET/DELETE, still preserve existing cloud query params
        existingReq.url.query.forEach((q: any) => {
          if (q.key && q.value) url.addQueryParams([{ key: q.key, value: q.value }]);
        });
      }

      const request = new Item({
        name: generateReadableName(route, schemaName),
        request: {
          method: route.method,
          url: url.toJSON(), // Use toJSON() to get clean plain object
          header: headers,
          body: body,
          auth: null, // inherit from folder
          description: {
            content: `Controller: ${route.controller}${schemaName ? `\nSchema: ${schemaName}` : ""}${result?.validation || ""}`,
            type: "text/markdown"
          }
        }
      });

      folder.items.add(request);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection.toJSON(), null, 2));
  fs.writeFileSync(DEBUG_FILE, `${debugLines.join('\n')}\n`);

  console.log("✅ Postman collection generated successfully!");

  // ✅ Sync to Postman Cloud if configured
  await syncToPostman(collection.toJSON());
}

main().catch(console.error);
