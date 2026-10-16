import { tool } from "@opencode-ai/plugin";
import { exec } from "child_process";
import * as fs from "fs";

export default tool({
  description: "Executes a project command in a specific folder and filters the output for specific keywords or error phrases to save tokens.",
  args: {
    command: tool.schema
      .string()
      .describe("The core command to execute (e.g., 'pnpm exec vitest run src/pages/process/PlanPage.test.tsx' or 'uv run pytest'). Do NOT include pipes, grep, or redirects here."),
    projectSubfolder: tool.schema
      .enum(["frontend", "backend"])
      .describe("Which subfolder of SGI to execute the command inside."),
    grepKeywords: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Optional array of keywords to search for. If provided, only lines containing these words (plus a few context lines) will be returned."),
    contextLines: tool.schema
      .number()
      .optional()
      .default(6)
      .describe("How many lines of context to include AFTER a keyword match (simulating grep -A)."),
    maxLines: tool.schema
      .number()
      .optional()
      .default(40)
      .describe("Maximum number of total lines to return to the context window (simulating head -n).")
  },
  async execute(args) {
    // Dynamically choose the folder so the agent never types absolute paths or "cd"
    const baseDir = "/mnt/c/Users/Usuario/Desktop/PROYECTOS/SGI";
    const workingDir = `${baseDir}/${args.projectSubfolder}`;

    if (!fs.existsSync(workingDir)) {
      return `Error: Target directory does not exist: ${workingDir}`;
    }

    // Sanitize command against common shell chaining injections
    const sanitizedCommand = args.command.replace(/[;&|`\$]/g, "");

    return new Promise<string>((resolve) => {
      exec(sanitizedCommand, { cwd: workingDir }, (error, stdout, stderr) => {
        // Merge stdout and stderr automatically (simulates 2>&1)
        const combinedOutput = stdout + (stderr ? `\n${stderr}` : "");
        const lines = combinedOutput.split("\n");
        
        let filteredLines: string[] = [];
        let captureCounter = 0;

        // If the agent requested keyword filtering (simulates grep)
        if (args.grepKeywords && args.grepKeywords.length > 0) {
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check if line contains ANY of the requested keywords
            const matchesKeyword = args.grepKeywords.some(keyword => line.includes(keyword));
            
            if (matchesKeyword) {
              captureCounter = (args.contextLines ?? 6) + 1; // current line + context lines
            }

            if (captureCounter > 0) {
              filteredLines.push(line);
              captureCounter--;
            }
          }
        } else {
          // If no grep keywords were provided, just take the raw output lines
          filteredLines = lines;
        }

        // Limit the total output lines (simulates head -n)
        const finalOutput = filteredLines.slice(0, args.maxLines).join("\n");
        const status = !error ? "SUCCESS" : "FAILED";

        if (finalOutput.trim() === "" && error) {
          // Fallback: If filtering returned nothing but command failed, send the very end of the log
          return resolve(`--- COMMAND FAILED (Filters yielded no results) ---\n${lines.slice(-15).join("\n")}`);
        }

        resolve(`--- COMMAND EXECUTION SUMMARY (${status}) ---\n${finalOutput}`);
      });
    });
  },
});
