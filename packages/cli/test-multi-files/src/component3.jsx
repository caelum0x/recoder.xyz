import React from 'react';
import { shallow, render } from 'enzyme';
import { expect } from 'chai';
import TodoItem from './TodoItem';

describe('TodoItem', () => {
  it('renders without crashing', () => {
    const wrapper = shallow(<TodoItem todo={{ id: 1, text: 'test' }} />);
    expect(wrapper).to.exist;
  });
});