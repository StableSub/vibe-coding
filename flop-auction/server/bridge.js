import { createInterface } from "node:readline";
import { sqliteStore } from "./sqlite.js";
import { auctionApi } from "./api.js";

const db = sqliteStore(process.argv[2]);
for await (const line of createInterface({ input: process.stdin })) {
  try {
    const { url, method, authorization, body } = JSON.parse(line);
    const headers = authorization ? { Authorization: authorization } : {};
    const request = new Request(new URL(url, "http://flask.local"), { method, headers, body: method === "GET" ? undefined : body });
    const response = await auctionApi(request, db);
    console.log(JSON.stringify({ status: response.status, body: await response.text() }));
  } catch (error) {
    console.error("Local engine error", error.message);
    console.log(JSON.stringify({ status: 503, body: JSON.stringify({ error: { code: "SERVICE", message: "경매 엔진에 연결할 수 없습니다." } }) }));
  }
}
db.close();
