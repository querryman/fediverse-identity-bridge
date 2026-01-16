import os

root_dir = r"."
output_file = r"combined.txt"

excluded_dirs = {"node_modules", ".git", "dist", "build"}

text_extensions = {
    ".txt", ".js", ".ts", ".ps1", ".psm1", ".json", ".yaml", ".yml",
    ".xml", ".html", ".css", ".scss", ".md", ".py", ".java", ".c", ".cpp",
    ".h", ".hpp", ".cs", ".go", ".rs", ".sh", ".bat", ".cmd", ".sql", ".ini", ".cfg"
}

with open(output_file, "w", encoding="utf-8") as outfile:
    for root, dirs, files in os.walk(root_dir):
        # Modify dirs in-place to skip excluded folders
        dirs[:] = [d for d in dirs if d not in excluded_dirs]

        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in text_extensions:
                file_path = os.path.join(root, file)
                outfile.write(f"\n===== FILE: {file_path} =====\n\n")
                try:
                    with open(file_path, "r", encoding="utf-8", errors="ignore") as infile:
                        outfile.write(infile.read())
                except Exception as e:
                    outfile.write(f"\n[ERROR READING FILE: {e}]\n")
