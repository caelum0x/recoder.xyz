import React from 'react';
import { render } from 'enzyme';
import App from './App';
import TodoItem from './TodoItem';

describe('App', () => {
  it('renders without crashing', () => {
    const wrapper = render(<App />);
    expect(wrapper).to.exist;
  });
});