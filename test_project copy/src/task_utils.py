"""
Utility functions for task management
"""
import datetime
import json

def is_valid_task(task_data):
    """Check if the task data is valid"""
    if not task_data:
        return False
    
    if not "title" in task_data or not task_data["title"]:
        return False
    
    return True

def format_task_for_display(task):
    """Format a task for display with additional information"""
    # Copy the task to avoid modifying the original
    formatted_task = task.copy()
    
    # Add formatted date
    if "created_at" in formatted_task:
        try:
            created_date = datetime.datetime.fromisoformat(formatted_task["created_at"])
            formatted_task["created_at_formatted"] = created_date.strftime("%Y-%m-%d %H:%M:%S")
            formatted_task["days_since_creation"] = (datetime.datetime.now() - created_date).days
        except:
            formatted_task["created_at_formatted"] = formatted_task["created_at"]
            formatted_task["days_since_creation"] = 0
    
    # Add status text
    formatted_task["status"] = "Completed" if formatted_task.get("completed", False) else "Pending"
    
    # Add a priority indicator (just a placeholder in this example)
    formatted_task["priority"] = "Medium"
    
    return formatted_task

def search_tasks(tasks, query):
    """Search for tasks that match the query string"""
    results = []
    
    if not query:
        return tasks
    
    query = query.lower()
    
    for task in tasks:
        if query in task.get("title", "").lower() or query in task.get("description", "").lower():
            results.append(task)
    
    return results

def filter_tasks_by_category(tasks, category):
    """Filter tasks by category"""
    if not category:
        return tasks
    
    filtered_tasks = []
    for task in tasks:
        if task.get("category") == category:
            filtered_tasks.append(task)
    
    return filtered_tasks

def filter_tasks_by_completion(tasks, completed=True):
    """Filter tasks by completion status"""
    filtered_tasks = []
    for task in tasks:
        if task.get("completed", False) == completed:
            filtered_tasks.append(task)
    
    return filtered_tasks

def calculate_task_statistics(tasks):
    """Calculate statistics for a list of tasks"""
    if not tasks:
        return {
            "total": 0,
            "completed": 0,
            "pending": 0,
            "categories": {},
            "completion_rate": 0
        }
    
    total = len(tasks)
    completed_tasks = [t for t in tasks if t.get("completed", False)]
    completed = len(completed_tasks)
    
    categories = {}
    for task in tasks:
        category = task.get("category", "uncategorized")
        categories[category] = categories.get(category, 0) + 1
    
    # Calculate category percentages
    category_stats = {}
    for cat, count in categories.items():
        category_stats[cat] = {
            "count": count,
            "percentage": (count / total) * 100
        }
    
    return {
        "total": total,
        "completed": completed,
        "pending": total - completed,
        "completion_rate": (completed / total) * 100,
        "categories": category_stats
    }

def get_overdue_tasks(tasks, deadline_days=7):
    """Get tasks that are overdue (older than deadline_days and not completed)"""
    overdue = []
    now = datetime.datetime.now()
    
    for task in tasks:
        if task.get("completed", False):
            continue
        
        created_str = task.get("created_at")
        if not created_str:
            continue
        
        try:
            created_date = datetime.datetime.fromisoformat(created_str)
            days_since_creation = (now - created_date).days
            
            if days_since_creation > deadline_days:
                task_copy = task.copy()
                task_copy["days_overdue"] = days_since_creation - deadline_days
                overdue.append(task_copy)
        except:
            # Skip tasks with invalid date format
            continue
    
    return overdue

def export_tasks_to_json(tasks, filename):
    """Export tasks to a JSON file"""
    try:
        with open(filename, "w") as f:
            json.dump({"tasks": tasks}, f, indent=2)
        return True
    except Exception as e:
        print(f"Failed to export tasks: {str(e)}")
        return False

def import_tasks_from_json(filename):
    """Import tasks from a JSON file"""
    try:
        with open(filename, "r") as f:
            data = json.load(f)
            return data.get("tasks", [])
    except Exception as e:
        print(f"Failed to import tasks: {str(e)}")
        return []

def generate_task_report(tasks):
    """Generate a detailed report of tasks"""
    stats = calculate_task_statistics(tasks)
    
    # Duplicate code from calculate_task_statistics
    categories = {}
    for task in tasks:
        category = task.get("category", "uncategorized")
        if category in categories:
            categories[category] += 1
        else:
            categories[category] = 1
    
    # Very complex and inefficient way to sort tasks by category
    sorted_tasks = {}
    for category in categories.keys():
        sorted_tasks[category] = []
    
    for task in tasks:
        category = task.get("category", "uncategorized")
        if category in sorted_tasks:
            sorted_tasks[category].append(task)
    
    # Generate report text
    report = "Task Management Report\n"
    report += "=====================\n\n"
    report += f"Total Tasks: {stats['total']}\n"
    report += f"Completed: {stats['completed']} ({stats['completion_rate']:.1f}%)\n"
    report += f"Pending: {stats['pending']}\n\n"
    
    report += "Tasks by Category:\n"
    report += "-----------------\n"
    for category, tasks_in_category in sorted_tasks.items():
        completed_in_category = len([t for t in tasks_in_category if t.get("completed", False)])
        report += f"{category}: {len(tasks_in_category)} tasks, {completed_in_category} completed\n"
    
    return report 