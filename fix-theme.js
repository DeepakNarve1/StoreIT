const fs = require("fs");
const path = require("path");
const srcDir = path.join(process.cwd(), "apps/web/src");

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      results.push(file);
    }
  });
  return results;
}

const files = walk(srcDir);
let totalReplaced = 0;

files.forEach((file) => {
  let content = fs.readFileSync(file, "utf8");
  const initialContent = content;

  content = content
    .replace(/\btext-blue-600\b/g, "text-primary-500")
    .replace(/\btext-blue-500\b/g, "text-primary-500")
    .replace(/\btext-blue-700\b/g, "text-[#e91e63]")
    .replace(/\btext-blue-400\b/g, "text-[#ff8a80]")
    .replace(/\btext-blue-800\b/g, "text-pink-800")
    .replace(/\btext-blue-900\b/g, "text-pink-900")
    .replace(/\bbg-blue-600\b/g, "bg-primary-500")
    .replace(/\bbg-blue-500\b/g, "bg-primary-500")
    .replace(/\bbg-blue-700\b/g, "bg-[#e91e63]")
    .replace(/\bbg-blue-400\b/g, "bg-[#ff8a80]")
    .replace(/\bbg-blue-800\b/g, "bg-pink-800")
    .replace(/\bbg-blue-50\b/g, "bg-pink-50")
    .replace(/\bbg-blue-100\b/g, "bg-pink-100")
    .replace(/\bbg-blue-200\b/g, "bg-pink-200")
    .replace(/\bbg-blue-300\b/g, "bg-pink-300")
    .replace(/\bbg-blue-900\b/g, "bg-pink-900")
    .replace(/\bborder-blue-600\b/g, "border-[#f06292]")
    .replace(/\bborder-blue-500\b/g, "border-[#f06292]")
    .replace(/\bborder-blue-400\b/g, "border-[#ff8a80]")
    .replace(/\bborder-blue-300\b/g, "border-pink-300")
    .replace(/\bborder-blue-200\b/g, "border-pink-200")
    .replace(/\bborder-blue-100\b/g, "border-pink-100")
    .replace(/\bring-blue-500\b/g, "ring-[#f06292]")
    .replace(/\bring-blue-400\b/g, "ring-[#ff8a80]")
    .replace(/\bring-blue-200\b/g, "ring-pink-200")
    .replace(/\bfocus:ring-blue-500\b/g, "focus:ring-primary-500")
    .replace(/\bfocus:ring-blue-400\b/g, "focus:ring-[#ff8a80]");

  if (content !== initialContent) {
    fs.writeFileSync(file, content, "utf8");
    totalReplaced++;
  }
});
console.log("Total files updated:", totalReplaced);
