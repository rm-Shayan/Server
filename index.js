import { server,app } from "./App.js";
import { connectionDb } from "./DB/Db.js";
import dotenv from "dotenv";

dotenv.config({
  path: "./.env",
});
connectionDb();

app.listen ?? null;

server.listen(process.env.PORT || 3400, () => {
  console.log(`server is running on  `);
});
