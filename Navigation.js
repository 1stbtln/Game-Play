export class Navigation {
    constructor(container, items, onSelect) {
        this.container = container;
        this.items = items;
        this.onSelect = onSelect;
    }

    render() {
        this.container.innerHTML = this.items.map(item => `
            <button data-section="${item.id}" class="nav-button">
                <img src="./assets/${item.icon}" alt="${item.text} Icon" class="nav-icon">
                <span class="nav-text">${item.text}</span>
            </button>
        `).join('');

        this.attachEventListeners();
    }

    attachEventListeners() {
        this.container.querySelectorAll('.nav-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const section = e.currentTarget.dataset.section;
                this.setActiveButton(button);
                this.onSelect(section);
            });
        });
    }

    setActiveButton(activeButton) {
        this.container.querySelectorAll('.nav-button')
            .forEach(btn => btn.classList.remove('active'));
        activeButton.classList.add('active');
    }
}
