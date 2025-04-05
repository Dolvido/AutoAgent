"""
Task Management API
A simple REST API for managing tasks with intentional code quality issues.
"""
from flask import Flask, request, jsonify
import json
import os
import datetime

app = Flask(__name__)

# Global variable for storing tasks
TASKS = []
task_id_counter = 0

# Load tasks from file
def loadTasksFromFile():
    global TASKS, task_id_counter
    try:
        if os.path.exists("tasks.json"):
            with open("tasks.json", "r") as f:
                data = json.load(f)
                TASKS = data.get("tasks", [])
                task_id_counter = data.get("counter", 0)
    except:
        print("Error loading tasks from file")

# Save tasks to file
def save_tasks():
    try:
        with open("tasks.json", "w") as f:
            json.dump({"tasks": TASKS, "counter": task_id_counter}, f, indent=2)
    except Exception as e:
        print(f"Failed to save tasks: {str(e)}")

# Get all tasks
@app.route("/tasks", methods=["GET"])
def get_tasks():
    category = request.args.get("category")
    if category:
        filtered = [t for t in TASKS if t["category"] == category]
        return jsonify(filtered)
    return jsonify(TASKS)

# Get task by ID
@app.route("/tasks/<int:task_id>", methods=["GET"])
def GetTaskById(task_id):
    for task in TASKS:
        if task["id"] == task_id:
            return jsonify(task)
    return jsonify({"error": "Task not found"}), 404

# Create a new task
@app.route("/tasks", methods=["POST"])
def createTask():
    global task_id_counter
    data = request.get_json()
    
    # Check if required fields are present
    if not data or not "title" in data:
        return jsonify({"error": "Title is required"}), 400
    
    task_id_counter += 1
    new_task = {
        "id": task_id_counter,
        "title": data["title"],
        "description": data.get("description", ""),
        "category": data.get("category", "uncategorized"),
        "completed": False,
        "created_at": datetime.datetime.now().isoformat()
    }
    
    TASKS.append(new_task)
    save_tasks()
    return jsonify(new_task), 201

# Update a task
@app.route("/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    data = request.get_json()
    
    for i, task in enumerate(TASKS):
        if task["id"] == task_id:
            # Update task fields
            TASKS[i]["title"] = data.get("title", task["title"])
            TASKS[i]["description"] = data.get("description", task["description"])
            TASKS[i]["category"] = data.get("category", task["category"])
            TASKS[i]["completed"] = data.get("completed", task["completed"])
            save_tasks()
            return jsonify(TASKS[i])
    
    return jsonify({"error": "Task not found"}), 404

# Delete a task
@app.route("/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    for i, task in enumerate(TASKS):
        if task["id"] == task_id:
            del TASKS[i]
            save_tasks()
            return jsonify({"message": "Task deleted"}), 200
    
    return jsonify({"error": "Task not found"}), 404

# Mark a task as completed
@app.route("/tasks/<int:task_id>/complete", methods=["POST"])
def CompleteTask(task_id):
    for i, task in enumerate(TASKS):
        if task["id"] == task_id:
            TASKS[i]["completed"] = True
            save_tasks()
            return jsonify(TASKS[i])
    
    return jsonify({"error": "Task not found"}), 404

# Get task statistics
@app.route("/stats", methods=["GET"])
def get_statistics():
    if len(TASKS) == 0:
        return jsonify({
            "total": 0,
            "completed": 0,
            "pending": 0,
            "categories": {}
        })
    
    total = len(TASKS)
    completed = len([t for t in TASKS if t["completed"]])
    categories = {}
    
    for task in TASKS:
        category = task["category"]
        if category in categories:
            categories[category] += 1
        else:
            categories[category] = 1
    
    # Calculate category percentages
    for cat in categories:
        cat_count = categories[cat]
        categories[cat] = {
            "count": cat_count,
            "percentage": (cat_count / total) * 100
        }
    
    statistics = {
        "total": total,
        "completed": completed,
        "pending": total - completed,
        "completion_rate": (completed / total) * 100 if total > 0 else 0,
        "categories": categories
    }
    
    return jsonify(statistics)

# Run the application
if __name__ == "__main__":
    loadTasksFromFile()
    app.run(debug=True) 