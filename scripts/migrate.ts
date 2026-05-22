import { closeDatabase, createDatabaseClient } from "../db/client";

const client = createDatabaseClient();
client.sqlite.close();
closeDatabase();
