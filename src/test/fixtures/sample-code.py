# Sample Python code for testing
from typing import List, Optional


class SampleClass:
    """A sample class for testing purposes."""

    def __init__(self, initial_value: int = 0):
        self._value = initial_value

    @property
    def value(self) -> int:
        """Get the current value."""
        return self._value

    @value.setter
    def value(self, new_value: int) -> None:
        """Set a new value."""
        if new_value < 0:
            raise ValueError("Value cannot be negative")
        self._value = new_value

    def increment(self) -> int:
        """Increment the value by 1."""
        self._value += 1
        return self._value

    def decrement(self) -> int:
        """Decrement the value by 1."""
        self._value -= 1
        return self._value

    def reset(self) -> None:
        """Reset the value to 0."""
        self._value = 0


def calculate_sum(numbers: List[int]) -> int:
    """Calculate the sum of a list of numbers."""
    return sum(numbers)


def find_max(numbers: List[int]) -> int:
    """Find the maximum value in a list."""
    if not numbers:
        raise ValueError("List cannot be empty")
    return max(numbers)


def find_min(numbers: List[int]) -> int:
    """Find the minimum value in a list."""
    if not numbers:
        raise ValueError("List cannot be empty")
    return min(numbers)


# Function with potential issues for testing linting
def problematic_function(input_data):
    """Function with linting issues for testing."""
    result = input_data  # Missing type hints
    if result == None:  # Should use 'is None'
        return None
    return result


def unused_function():
    """This function is never used - should be caught by linting."""
    pass