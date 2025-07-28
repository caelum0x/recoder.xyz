import React from 'react';
import './style.css';

class TodoList extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      todos: [],
    };
  }

  componentDidMount() {
    fetch('https://jsonplaceholder.typicode.com/todos')
      .then(response => response.json())
      .then(data => {
        this.setState({
          todos: data,
        });
      })
      .catch(error => console.log(error));
  }

  render() {
    return (
      <ul className="todo-list">
        {this.state.todos.map(todo => (
          <li key={todo.id}>
            <TodoItem todo={todo} />
          </li>
        ))}
      </ul>
    );
  }
}