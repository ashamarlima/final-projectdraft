import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  Send
} from "lucide-react";
import { askMaterialQuestion } from "./materialsAPI";

//A chat assistant grounded in one lesson's text.
//
//The lesson text stays on the server: this sends the question and shows the
//answer that was written from the lesson, so a student cannot read the
//stored text out of the browser.
function LessonAIChat({ material }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const messagesEndRef = useRef(null);

  //the question box is uncontrolled: its value is read when the form is
  //submitted, so typing does not re-render the conversation
  const inputRef = useRef(null);

  //keep the newest message in view
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages, loading, error]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const question = (
      inputRef.current?.value || ""
    ).trim();

    if (!question || loading) {
      return;
    }

    //clear the box as soon as the question has been taken
    inputRef.current.value = "";

    setError("");

    setMessages((current) => [
      ...current,
      { role: "student", content: question }
    ]);

    setLoading(true);

    try {
      const answer = await askMaterialQuestion(
        material._id,
        question
      );

      setMessages((current) => [
        ...current,
        { role: "assistant", content: answer }
      ]);

    } catch (err) {
      setError(
        err.message ||
          "The AI assistant is currently unavailable"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* Messages */}
      <div className="min-h-64 max-h-[420px] overflow-y-auto bg-white border border-gray-200 rounded-2xl p-5 space-y-4">

        {messages.length === 0 && !loading && (
          <div className="text-center py-12">
            <Bot
              size={38}
              className="mx-auto text-gray-300 mb-3"
            />

            <p className="text-gray-600">
              Ask anything about this lesson.
            </p>

            <p className="text-sm text-gray-400 mt-1">
              Answers come from this lesson's own text,
              and fall back to general knowledge when the
              lesson does not cover the question.
            </p>
          </div>
        )}

        {messages.map((chatMessage, index) => (
          <div
            key={index}
            className={
              chatMessage.role === "student"
                ? "flex justify-end"
                : "flex justify-start"
            }
          >
            <div
              className={
                chatMessage.role === "student"
                  ? "max-w-xl bg-blue-500 text-white rounded-2xl rounded-br-sm px-4 py-3"
                  : "max-w-xl bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm px-4 py-3"
              }
            >
              <p className="text-sm leading-6 whitespace-pre-line">
                {chatMessage.content}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-500 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <Loader2
                size={15}
                className="animate-spin"
              />

              <span className="text-sm">
                Reading this lesson...
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-3"
      >
        <input
          ref={inputRef}
          type="text"
          defaultValue=""
          placeholder="Ask a question about this lesson..."
          maxLength={1000}
          disabled={loading}
          required
          className="flex-1 bg-white border border-gray-300 text-gray-800 rounded-xl px-4 py-3 outline-none focus:border-blue-500 disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl cursor-pointer transition-colors"
        >
          <Send size={16} />

          <span className="hidden sm:inline">
            Send
          </span>
        </button>
      </form>

    </div>
  );
}

export default LessonAIChat;
