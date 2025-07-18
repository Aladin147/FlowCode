// Sample TypeScript code for testing
export class SampleClass {
    private value: number;

    constructor(initialValue: number = 0) {
        this.value = initialValue;
    }

    public getValue(): number {
        return this.value;
    }

    public setValue(newValue: number): void {
        if (newValue < 0) {
            throw new Error('Value cannot be negative');
        }
        this.value = newValue;
    }

    public increment(): number {
        this.value++;
        return this.value;
    }

    public decrement(): number {
        this.value--;
        return this.value;
    }

    public reset(): void {
        this.value = 0;
    }
}

export function calculateSum(numbers: number[]): number {
    return numbers.reduce((sum, num) => sum + num, 0);
}

export function findMax(numbers: number[]): number {
    if (numbers.length === 0) {
        throw new Error('Array cannot be empty');
    }
    return Math.max(...numbers);
}

// Function with potential issues for testing linting
export function problematicFunction(input: any): any {
    var result = input; // Should use let/const
    if (result === null) { // Should use ===
        return undefined;
    }
    return result;
}