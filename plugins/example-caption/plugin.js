localdrawPlugin.register({
  actions: {
    caption({ prompt, selectedElements }) {
      const elements = Array.isArray(selectedElements) ? selectedElements : [];
      if (elements.length === 0) throw new Error("Select at least one element");
      const right = Math.max(...elements.map((element) => Number(element.x || 0) + Number(element.width || 0)));
      const top = Math.min(...elements.map((element) => Number(element.y || 0)));
      return {
        message: "Caption added",
        elements: [{
          type: "text",
          x: right + 40,
          y: top,
          text: String(prompt || "Caption"),
          fontSize: 24,
          strokeColor: "#5f3dc4"
        }]
      };
    }
  }
});
