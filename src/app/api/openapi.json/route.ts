import { openApiDocument } from "@/lib/openapi/document";

export async function GET() {
  return Response.json(openApiDocument());
}
