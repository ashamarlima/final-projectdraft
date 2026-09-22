import json
import os
import math

batch_import_data = {
  "client/src/App.jsx": ["client/src/features/materials/MaterialManager.jsx", "client/src/features/student/StudentDashboard.jsx", "client/src/features/users/ClassManagement.jsx", "client/src/features/users/GradeModel.jsx", "client/src/features/users/Login.jsx", "client/src/features/users/SearchBar.jsx", "client/src/features/users/StatsCard.jsx", "client/src/features/users/UserModel.jsx", "client/src/features/users/UserTable.jsx", "client/src/features/users/userAPI.js"],
  "client/src/features/ai/StudentAIChat.jsx": ["client/src/features/ai/VideoPlayerModal.jsx", "client/src/features/users/userAPI.js"],
  "client/src/features/ai/VideoPlayerModal.jsx": ["client/src/features/users/userAPI.js"],
  "client/src/features/notes/NotesPage.jsx": ["client/src/features/notes/notesAPI.js", "client/src/shared/form/readFormValues.js"],
  "client/src/features/student/AchievementsPage.jsx": [],
  "client/src/features/student/DashboardPage.jsx": [],
  "client/src/features/student/LeaderboardPage.jsx": ["client/src/features/users/userAPI.js"],
  "client/src/features/student/LearnPage.jsx": [],
  "client/src/features/student/ProfilePage.jsx": [],
  "client/src/features/student/StudentDashboard.jsx": ["client/src/features/ai/StudentAIChat.jsx", "client/src/features/materials/LessonAIView.jsx", "client/src/features/notes/NoteViewPage.jsx", "client/src/features/notes/NotesPage.jsx", "client/src/features/student/AchievementsPage.jsx", "client/src/features/student/DashboardPage.jsx", "client/src/features/student/LeaderboardPage.jsx", "client/src/features/student/LearnPage.jsx", "client/src/features/student/ProfilePage.jsx", "client/src/features/student/QuizPage.jsx", "client/src/features/student/StudentGrade.jsx", "client/src/features/student/SubjectPage.jsx"],
  "client/src/features/student/StudentGrade.jsx": [],
  "client/src/features/users/ClassManagement.jsx": ["client/src/features/users/userAPI.js", "client/src/shared/form/readFormValues.js"],
  "client/src/features/users/GradeModel.jsx": ["client/src/shared/form/readFormValues.js"],
  "client/src/features/users/Login.jsx": ["client/src/features/users/userAPI.js", "client/src/shared/form/readFormValues.js"],
  "client/src/features/users/SearchBar.jsx": [],
  "client/src/features/users/StatsCard.jsx": [],
  "client/src/features/users/UserModel.jsx": ["client/src/shared/form/readFormValues.js"],
  "client/src/features/users/UserTable.jsx": [],
  "client/src/features/users/userAPI.js": ["client/src/shared/api/apiClient.js"],
  "client/src/main.jsx": ["client/src/App.jsx", "client/src/index.css"],
  "client/src/shared/form/readFormValues.js": []
}

results_path = "C:/Users/MSi/Downloads/Final project/.ua/tmp/ua-file-extract-results-1.json"
with open(results_path, 'r') as f:
    results_json = json.load(f)

nodes = []
edges = []

for file_res in results_json['results']:
    path = file_res['path']

    complexity = "simple"
    if file_res['nonEmptyLines'] > 200:
        complexity = "complex"
    elif file_res['nonEmptyLines'] > 50:
        complexity = "moderate"

    summary = f"Source file {path}."
    tags = ["code"]

    if "App.jsx" in path:
        summary = "Main application component that handles routing and top-level state management."
        tags = ["entry-point", "router", "state-management"]
    elif "StudentAIChat" in path:
        summary = "AI-powered chat interface for students to interact with course materials."
        tags = ["ai-chat", "interactive", "student-feature"]
    elif "VideoPlayerModal" in path:
        summary = "Modal component for displaying educational videos within the AI chat context."
        tags = ["component", "video-player", "ui-modal"]
    elif "NotesPage" in path:
        summary = "Page for managing and viewing student notes and AI-generated summaries."
        tags = ["notes", "management", "student-feature"]
    elif "AchievementsPage" in path:
        summary = "Displays student achievements and gamification progress."
        tags = ["gamification", "achievements", "student-feature"]
    elif "DashboardPage" in path:
        summary = "Core student dashboard providing an overview of learning progress."
        tags = ["dashboard", "overview", "student-feature"]
    elif "LeaderboardPage" in path:
        summary = "Competitive leaderboard showing rankings among students."
        tags = ["gamification", "leaderboard", "student-feature"]
    elif "LearnPage" in path:
        summary = "Main learning interface where students engage with course content."
        tags = ["learning", "course-content", "student-feature"]
    elif "ProfilePage" in path:
        summary = "Student profile page for managing personal information."
        tags = ["profile", "user-settings", "student-feature"]
    elif "StudentDashboard" in path:
        summary = "High-level orchestrator for the student experience, managing navigation between various feature pages."
        tags = ["orchestrator", "navigation", "student-feature"]
    elif "StudentGrade" in path:
        summary = "Component for viewing and managing individual student grades."
        tags = ["grades", "academic-record", "student-feature"]
    elif "ClassManagement" in path:
        summary = "Administrative interface for managing classes and student enrollments."
        tags = ["admin", "class-management", "user-feature"]
    elif "GradeModel" in path:
        summary = "Model for editing and updating grade information."
        tags = ["data-model", "grade-editing", "user-feature"]
    elif "Login" in path:
        summary = "Authentication component for user login."
        tags = ["auth", "login", "entry-point"]
    elif "SearchBar" in path:
        summary = "Reusable search component for finding users or materials."
        tags = ["utility", "search", "ui-component"]
    elif "StatsCard" in path:
        summary = "Small UI component to display key statistics."
        tags = ["ui-component", "statistics", "visual"]
    elif "UserModel" in path:
        summary = "Model for managing user profile and account details."
        tags = ["data-model", "user-profile", "user-feature"]
    elif "UserTable" in path:
        summary = "Table component for displaying and filtering lists of users."
        tags = ["ui-component", "data-table", "user-feature"]
    elif "userAPI" in path:
        summary = "API service layer for user-related network requests."
        tags = ["api-handler", "service", "network"]
    elif "main.jsx" in path:
        summary = "React entry point that mounts the application to the DOM."
        tags = ["entry-point", "bootstrap"]
    elif "readFormValues" in path:
        summary = "Utility function to extract and sanitize values from form elements."
        tags = ["utility", "form-handling"]

    nodes.append({
        "id": f"file:{path}",
        "type": "file",
        "name": path.split('/')[-1],
        "filePath": path,
        "summary": summary,
        "tags": tags,
        "complexity": complexity
    })

    for func in file_res.get('functions', []):
        if func['name'] in ['App', 'StudentAIChat', 'VideoPlayerModal', 'NotesPage', 'AchievementsPage', 'DashboardPage', 'LeaderboardPage', 'LearnPage', 'ProfilePage', 'StudentDashboard', 'StudentGrade', 'ClassManagement', 'GradeModel', 'Login', 'UserModel', 'UserTable']:
            nodes.append({
                "id": f"function:{path}:{func['name']}",
                "type": "function",
                "name": func['name'],
                "filePath": path,
                "lineRange": [func['startLine'], func['endLine']],
                "summary": f"Main component function {func['name']} in {path}.",
                "tags": ["component", "react"],
                "complexity": "complex" if (func['endLine'] - func['startLine'] > 100) else "moderate"
            })
            edges.append({
                "source": f"file:{path}",
                "target": f"function:{path}:{func['name']}",
                "type": "contains",
                "direction": "forward",
                "weight": 1.0
            })

    if path in batch_import_data:
        for imp in batch_import_data[path]:
            edges.append({
                "source": f"file:{path}",
                "target": f"file:{imp}",
                "type": "imports",
                "direction": "forward",
                "weight": 0.7
            })

node_count = len(nodes)
edge_count = len(edges)
parts = math.ceil(max(node_count / 60, edge_count / 120)) if node_count > 60 or edge_count > 120 else 1

if parts == 1:
    with open("C:/Users/MSi/Downloads/Final project/.ua/intermediate/batch-1.json", "w") as f:
        json.dump({"nodes": nodes, "edges": edges}, f, indent=2)
else:
    all_files = sorted([n['filePath'] for n in nodes if n['type'] == 'file'])
    chunk_size = math.ceil(len(all_files) / parts)
    for k in range(parts):
        part_files = set(all_files[k*chunk_size : (k+1)*chunk_size])
        part_nodes = [n for n in nodes if n.get('filePath') in part_files or (n['type'] != 'file' and n.get('filePath') in part_files)]
        part_edges = [e for e in edges if any(n['id'] == e['source'] for n in part_nodes)]
        with open(f"C:/Users/MSi/Downloads/Final project/.ua/intermediate/batch-1-part-{k+1}.json", "w") as f:
            json.dump({"nodes": part_nodes, "edges": part_edges}, f, indent=2)

print(f"Wrote {parts} part(s). Total nodes: {node_count}, Total edges: {edge_count}")
