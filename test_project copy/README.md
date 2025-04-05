# Task Management API

A simple REST API for managing tasks, built with Flask.

## Description

This project is a basic task management API that allows users to create, read, update, and delete tasks. It provides endpoints for filtering tasks by category, searching, and generating statistics.

## Features

- CRUD operations for tasks
- Task categorization
- Task filtering and searching
- Task statistics
- JSON import/export

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

## Usage

Run the API server:
```
python src/app.py
```

The API will be available at http://localhost:5000

## API Endpoints

- `GET /tasks` - Get all tasks
- `GET /tasks?category={category}` - Filter tasks by category
- `GET /tasks/{id}` - Get a specific task
- `POST /tasks` - Create a new task
- `PUT /tasks/{id}` - Update a task
- `DELETE /tasks/{id}` - Delete a task
- `POST /tasks/{id}/complete` - Mark a task as completed
- `GET /stats` - Get task statistics

## File Structure

```
task_management/
├── src/
│   ├── app.py              # Main application file
│   └── task_utils.py       # Utility functions
├── tests/
│   └── test_task_utils.py  # Tests for utility functions
└── requirements.txt        # Project dependencies
```

## Known Issues

- Error handling is minimal
- No authentication or authorization
- The data is stored in a local JSON file, not a database
- Test coverage is incomplete

## Future Improvements

- Add proper error handling
- Implement authentication
- Use a database for data storage
- Improve test coverage
- Add a web UI 