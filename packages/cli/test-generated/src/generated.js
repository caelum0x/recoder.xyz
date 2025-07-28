// import dependencies
import React from "react";
import { useState } from "react";

// define a todo list component
const TodoList = () => {
  // create state to keep track of todos
  const [todos, setTodos] = useState([]);

  // handle add new todo button click event
  const handleAddTodoButtonClick = (event) => {
    event.preventDefault();

    // validate input data and add new todo to todos array
    if (!validateInputData()) {
      return;
    }

    setTodos([...todos, { text: "", completed: false }]);
  };

  // handle delete todo button click event
  const handleDeleteTodoButtonClick = (event) => {
    event.preventDefault();

    // validate input data and remove selected todo from todos array
    if (!validateInputData()) {
      return;
    }

    setTodos(todos.filter((todo) => todo.text !== event.target.value));
  };

  // render list of todos
  const renderTodoList = () => {
    return todos.map((todo, index) => {
      return (
        <li key={index}>
          <input
            type="text"
            value={todo.text}
            onChange={(event) => setTodos([...todos].map((todo2) => ({ ...todo2, text: event.target.value })))}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleAddTodoButtonClick();
              }
            }}
          />
          <span>{todo.text}</span>
          <button onClick={handleDeleteTodoButtonClick}>X</button>
        </li>
      );
    });
  };

  // render list of todos with state and handlers
  return (
    <div>
      <h1>Todo List</h1>
      {renderTodoList()}
    </div>
  );
};

// handle form submission data validation
const validateInputData = () => {
  const errors = {};

  if (!validateTextInput("text", "Enter todo text here")) {
    errors.text = "Please enter a valid todo text.";
  }

  return Object.keys(errors).length > 0;
};

// handle form submission with submit button click event
const handleFormSubmitButtonClick = (event) => {
  event.preventDefault();

  const newTodo = {
    text: event.target.text.value,
    completed: false,
  };

  setTodos([...todos, newTodo]);
};

// handle form submission with add button click event
const handleAddButtonClick = (event) => {
  event.preventDefault();

  const newTodo = { text: "", completed: false };

  setTodos([...todos, newTodo]);
};

// handle form submission with delete button click event
const handleDeleteButtonClick = (event) => {
  event.preventDefault();

  const selectedIndex = todos.findIndex((todo) => todo.text === event.target.value);

  if (selectedIndex < 0) {
    return;
  }

  setTodos(todos.filter((todo, index) => index !== selectedIndex));
};

// render form with input fields and submit button
const TodoForm = () => {
  const [text, setText] = useState("");
  const [completed, setCompleted] = useState(false);

  return (
    <form onSubmit={handleFormSubmitButtonClick}>
      <label>Todo:</label>
      <input type="text" value={text} onChange={(event) => setText(event.target.value)} />
      {completed && <span><b>Completed</b></span>}
      <button type="submit">Submit</button>
    </form>
  );
};

// render list of todos with form and submit buttons
const TodoListForm = () => {
  const [text, setText] = useState("");
  const [completed, setCompleted] = useState(false);

  return (
    <form onSubmit={handleFormSubmitButtonClick}>
      <label>Todo:</label>
      <input type="text" value={text} onChange={(event) => setText(event.target.value)} />
      {completed && <span><b>Completed</b></span>}
      <button type="submit">Submit</button>
    </form>
  );
};

// render todo list with state and handlers
const TodoListContainer = () => {
  const [todos, setTodos] = useState([]);

  return (
    <>
      <h1>Todo List</h1>
      {renderTodoList()}
      <TodoForm />
      <TodoListForm />
    </>
  );
};

// mount and render todo list with state and handlers
const App = () => {
  const [todos, setTodos] = useState([]);

  return (
    <div>
      <h1>Todo List</h1>
      <TodoListContainer />
    </div>
  );
};

// export App for use in other components
export default App;