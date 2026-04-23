import React, { useState } from 'react';

const Calculator = ({ onConfirm, onCancel, initialValue = '0' }) => {
    const [calcDisplay, setCalcDisplay] = useState(initialValue === '0' ? '0' : initialValue);
    const [calcExpression, setCalcExpression] = useState('');
    const [calcJustEvaluated, setCalcJustEvaluated] = useState(false);

    const handleCalcInput = (val) => {
        const operators = ['+', '-', '×', '÷'];
        if (val === 'C') {
            setCalcDisplay('0');
            setCalcExpression('');
            setCalcJustEvaluated(false);
            return;
        }
        if (val === '⌫') {
            setCalcDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
            setCalcJustEvaluated(false);
            return;
        }
        if (val === '=') {
            try {
                const expr = (calcExpression + calcDisplay).replace(/×/g, '*').replace(/÷/g, '/');
                // eslint-disable-next-line no-new-func
                const result = Function('"use strict"; return (' + expr + ')')();
                const rounded = Math.round(result * 1000) / 1000;
                setCalcDisplay(String(rounded));
                setCalcExpression('');
                setCalcJustEvaluated(true);
            } catch {
                setCalcDisplay('Error');
                setCalcExpression('');
            }
            return;
        }
        if (val === '✓') {
            const num = parseFloat(calcDisplay);
            if (!isNaN(num)) {
                onConfirm(String(num));
            }
            return;
        }
        if (operators.includes(val)) {
            setCalcExpression(calcExpression + calcDisplay + val);
            setCalcDisplay('0');
            setCalcJustEvaluated(false);
            return;
        }
        if (val === '.') {
            if (calcDisplay.includes('.')) return;
            setCalcDisplay(calcDisplay + '.');
            return;
        }
        // Digit
        if (calcJustEvaluated) {
            setCalcDisplay(val);
            setCalcJustEvaluated(false);
        } else {
            setCalcDisplay(calcDisplay === '0' ? val : calcDisplay + val);
        }
    };

    return (
        <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl select-none animate-in zoom-in duration-200">
            {/* Display */}
            <div className="bg-gray-800 text-white rounded-lg px-3 py-2 mb-2 text-right shadow-inner">
                {calcExpression && (
                    <div className="text-xs text-gray-400 truncate animate-fade-in">{calcExpression}</div>
                )}
                <div className="text-2xl font-bold font-mono truncate">{calcDisplay}</div>
            </div>
            {/* Buttons */}
            <div className="grid grid-cols-4 gap-1.5">
                {[
                    'C', '⌫', '÷', '×',
                    '7', '8', '9', '-',
                    '4', '5', '6', '+',
                    '1', '2', '3', '=',
                    '.', '0', '', '✓',
                ].map((btn, i) => {
                    if (btn === '') return <div key={i} />;
                    const isOperator = ['÷', '×', '-', '+'].includes(btn);
                    const isEquals = btn === '=';
                    const isConfirm = btn === '✓';
                    const isClear = btn === 'C';
                    const isBack = btn === '⌫';
                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => handleCalcInput(btn)}
                            className={`h-11 rounded-lg text-base font-bold transition-all active:scale-90
                                ${isConfirm ? 'bg-brand-blue text-white hover:bg-blue-700 col-span-1 shadow-md shadow-blue-200'
                                    : isEquals ? 'bg-brand-blue/80 text-white hover:bg-brand-blue shadow-sm'
                                        : isOperator ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 shadow-sm border border-amber-200/50'
                                            : isClear ? 'bg-red-100 text-red-700 hover:bg-red-200 shadow-sm border border-red-200/50'
                                                : isBack ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 shadow-sm'
                                                    : 'bg-white text-gray-800 hover:bg-gray-100 border border-gray-200 shadow-sm'}`}
                        >
                            {btn}
                        </button>
                    );
                })}
            </div>
            <div className="flex justify-between items-center mt-2 px-1">
                <p className="text-[10px] text-gray-400 font-medium italic">✓ para usar resultado</p>
                {onCancel && (
                    <button 
                        type="button" 
                        onClick={onCancel}
                        className="text-[10px] text-gray-400 hover:text-red-500 font-bold uppercase transition-colors"
                    >
                        Cerrar
                    </button>
                )}
            </div>
        </div>
    );
};

export default Calculator;
