import { memo } from 'react';

export const PODS = [
  { id: 'spring-boot', label: 'Spring Boot' },
  { id: 'python', label: 'Python' },
  { id: 'react', label: 'React' },
  { id: 'java', label: 'Java' }
];

function Pods({ podRef }) {
  return PODS.map((pod, index) => (
    <div
      key={pod.id}
      className="pod"
      aria-hidden="true"
      ref={(el) => {
        podRef.current[index] = el;
      }}
    >
      {pod.label}
    </div>
  ));
}

export default memo(Pods);
