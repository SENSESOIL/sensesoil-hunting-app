import os
import json

brain_dir = r"C:\Users\User\.gemini\antigravity\brain"
output_file = r"c:\Users\User\.antigravity\Sensesoilhunting_APP\history_matches.md"

keywords = ["狩獵管理", "狩獵覺醒", "派工", "專案管理", "外部存取", "資料站", "Supabase", "Firebase", "Vercel Blob", "S3", "排定專案", "上傳照片", "專案"]

found_count = 0

with open(output_file, "w", encoding="utf-8") as out:
    out.write("# Hunting Management (狩獵管理) vs Hunting Awakening (狩獵覺醒) Past Discussions\n\n")
    
    for root, dirs, files in os.walk(brain_dir):
        for f in files:
            if f == "transcript.jsonl":
                path = os.path.join(root, f)
                conv_id = os.path.basename(os.path.dirname(os.path.dirname(path)))
                try:
                    with open(path, "r", encoding="utf-8", errors="ignore") as file:
                        for line_idx, line in enumerate(file):
                            if any(kw in line for kw in keywords):
                                try:
                                    data = json.loads(line)
                                    step_type = data.get("type", "")
                                    content = data.get("content", "")
                                    if not isinstance(content, str):
                                        content = str(content)
                                    
                                    # Filter for meaningful discussions
                                    if any(kw in content for kw in ["專案", "派工", "照片", "資料庫", "Supabase", "Firebase", "存取", "架構", "外部", "管理", "覺醒"]):
                                        if step_type in ["USER_INPUT", "PLANNER_RESPONSE", "GENERIC"]:
                                            found_count += 1
                                            out.write(f"## Conv: `{conv_id}` | Step: {data.get('step_index')} | Type: `{step_type}`\n\n")
                                            out.write(content[:2500] + "\n\n---\n\n")
                                except Exception:
                                    pass
                except Exception as e:
                    pass

    out.write(f"\nTotal matches found: {found_count}\n")

print(f"Done! Found {found_count} matches.")
