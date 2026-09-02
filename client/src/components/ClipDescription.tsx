import { cn } from "@/lib/utils";
import { useLayoutEffect, useRef, useState } from "react";

export function ClipDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;
    setCanExpand(element.scrollHeight > element.clientHeight + 1);
  }, [description, expanded]);

  return (
    <>
      <p
        ref={textRef}
        className={cn(
          "mt-2 text-xs leading-5 text-[#37332c]",
          !expanded && "line-clamp-2"
        )}
      >
        {description}
      </p>
      {canExpand && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={event => {
            event.stopPropagation();
            setExpanded(value => !value);
          }}
          className="mt-1 text-[10px] font-bold text-[#bd7058] underline decoration-wavy underline-offset-4"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </>
  );
}
