"""
Tests for the task_utils module
"""
import sys
import os
import unittest
import datetime
import json

# Add the src directory to the path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../src')))

from task_utils import (
    is_valid_task,
    format_task_for_display,
    search_tasks,
    filter_tasks_by_category,
    calculate_task_statistics
)

class TestTaskUtils(unittest.TestCase):
    """Test cases for task_utils module"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.sample_tasks = [
            {
                "id": 1,
                "title": "Complete project",
                "description": "Finish the project by deadline",
                "category": "work",
                "completed": False,
                "created_at": "2023-03-15T10:00:00"
            },
            {
                "id": 2,
                "title": "Buy groceries",
                "description": "Get milk, eggs, and bread",
                "category": "personal",
                "completed": True,
                "created_at": "2023-03-14T15:30:00"
            },
            {
                "id": 3,
                "title": "Schedule meeting",
                "description": "Set up team meeting for next week",
                "category": "work",
                "completed": False,
                "created_at": "2023-03-13T09:15:00"
            }
        ]
    
    def test_is_valid_task(self):
        """Test validation of task data"""
        # Valid task
        valid_task = {"title": "Test Task", "description": "Test"}
        self.assertTrue(is_valid_task(valid_task))
        
        # Invalid tasks
        invalid_task1 = {}
        invalid_task2 = {"title": ""}
        invalid_task3 = {"description": "Missing title"}
        
        self.assertFalse(is_valid_task(invalid_task1))
        self.assertFalse(is_valid_task(invalid_task2))
        self.assertFalse(is_valid_task(invalid_task3))
    
    def test_format_task_for_display(self):
        """Test formatting of task for display"""
        task = self.sample_tasks[0]
        formatted = format_task_for_display(task)
        
        # Check that original task is not modified
        self.assertNotEqual(id(task), id(formatted))
        
        # Check that new fields are added
        self.assertIn("created_at_formatted", formatted)
        self.assertIn("days_since_creation", formatted)
        self.assertIn("status", formatted)
        self.assertIn("priority", formatted)
        
        # Check status text
        self.assertEqual(formatted["status"], "Pending")
    
    def test_search_tasks(self):
        """Test searching for tasks"""
        # Search by title
        results1 = search_tasks(self.sample_tasks, "project")
        self.assertEqual(len(results1), 1)
        self.assertEqual(results1[0]["id"], 1)
        
        # Search by description
        results2 = search_tasks(self.sample_tasks, "milk")
        self.assertEqual(len(results2), 1)
        self.assertEqual(results2[0]["id"], 2)
        
        # Empty search
        results3 = search_tasks(self.sample_tasks, "")
        self.assertEqual(len(results3), 3)
        
        # No results
        results4 = search_tasks(self.sample_tasks, "nonexistent")
        self.assertEqual(len(results4), 0)
    
    def test_filter_tasks_by_category(self):
        """Test filtering tasks by category"""
        # Filter work category
        work_tasks = filter_tasks_by_category(self.sample_tasks, "work")
        self.assertEqual(len(work_tasks), 2)
        
        # Filter personal category
        personal_tasks = filter_tasks_by_category(self.sample_tasks, "personal")
        self.assertEqual(len(personal_tasks), 1)
        self.assertEqual(personal_tasks[0]["id"], 2)
    
    # Missing test for filter_tasks_by_completion
    
    def test_calculate_task_statistics(self):
        """Test calculation of task statistics"""
        stats = calculate_task_statistics(self.sample_tasks)
        
        self.assertEqual(stats["total"], 3)
        self.assertEqual(stats["completed"], 1)
        self.assertEqual(stats["pending"], 2)
        self.assertAlmostEqual(stats["completion_rate"], 33.33333333333333)
        
        # Check categories
        self.assertEqual(len(stats["categories"]), 2)
        self.assertEqual(stats["categories"]["work"]["count"], 2)
        self.assertEqual(stats["categories"]["personal"]["count"], 1)
    
    # Missing test for other functions
    
if __name__ == "__main__":
    unittest.main() 