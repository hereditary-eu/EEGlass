import { useState } from "react";

interface MultiSelectDropdownProps {
  options: string[];
  selectedOptions: string[];
  onSelectedOptionsChange: (options: string[]) => void;
}

export function MultiSelectDropdown({ options, selectedOptions, onSelectedOptionsChange }: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const maxLength = 23;

  const handleCheckboxChange = (option: string) => {
    if (selectedOptions.includes(option)) {
      onSelectedOptionsChange(selectedOptions.filter((item) => item !== option));
      return;
    }

    onSelectedOptionsChange([...selectedOptions, option]);
  };

  const label =
    selectedOptions.join(", ").length > maxLength
      ? `${selectedOptions.join(", ").slice(0, maxLength)}..`
      : selectedOptions.join(", ") || "Select features";

  return (
    <div className="dropdown-container">
      <div className="dropdown-header" onClick={() => setIsOpen((value) => !value)}>
        {label}
        <span className="dropdown-arrow" />
      </div>
      {isOpen ? (
        <div className="dropdown-options">
          {options.map((option) => (
            <div key={option} className="dropdown-option">
              <label>
                <input
                  type="checkbox"
                  checked={selectedOptions.includes(option)}
                  onChange={() => handleCheckboxChange(option)}
                />
                {option}
              </label>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
