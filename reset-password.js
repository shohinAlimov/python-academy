require("dotenv").config();
const bcrypt = require("bcryptjs");
const { MongoClient } = require("mongodb");

const [username, newPassword] = process.argv.slice(2);
if (!username || !newPassword || newPassword.length < 6) {
  console.log(
    "Использование: node reset-password.js логин новый_пароль (мин. 6 символов)",
  );
  process.exit(1);
}

(async () => {
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const r = await client
    .db()
    .collection("users")
    .updateOne(
      { username: username.toLowerCase() },
      { $set: { passHash: await bcrypt.hash(newPassword, 10) } },
    );
  console.log(r.matchedCount ? "Пароль обновлён" : "Пользователь не найден");
  await client.close();
})();
