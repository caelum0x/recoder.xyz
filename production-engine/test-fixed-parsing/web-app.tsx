// src/CounterButton.tsx - Component for increment and decrement buttons with proper error handling and validation (if needed)
import React, { useState } from 'react';
import './CounterButton.css'; // Import custom CSS if necessary or define inline styles within this file using the styled-components library or a similar method to integrate Tailwind CSS classes directly into components when appropriate

interface CounterButtonProps {
  onClick: () => void;
  label: string;
}

const CounterButton: React.FC<CounterButtonProps> = ({ onClick, label }) => (
  <button className="p-2 bg-blue-500 hover:bg-blue-700 text-white font-bold py-1" onClick={onClick}>
    {label}
  </button>
);

export default CounterButton;