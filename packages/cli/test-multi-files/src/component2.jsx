import React from 'react';
import './style.css';

class TodoItem extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      completed: false,
    };
  }

  handleClick = () => {
    this.setState({
      completed: !this.state.completed,
    });
  }

  render() {
    const { todo, onComplete } = this.props;
    return (
      <li key={todo.id}>
        <input type="checkbox" checked={this.state.completed} onChange={onComplete ? () => onComplete(todo) : undefined} />
        <span>{todo.text}</span>
        <button onClick={() => this.handleClick()}>
          {this.state.completed ? 'X' : '✔'}
        </button>
      </li>
    );
  }
}