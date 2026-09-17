"use client";

import axiosInterceptorInstance from "@/lib/axios-interceptor";
import React from "react";

type Props = {
  tickets: any;
};

let stats: {
  value: string;
  color: string;
  name: string;
}[] = [
  {
    value: "10",
    color: "bg-slate-500",
    name: "Unassigned",
  },
  {
    value: "20",
    color: "bg-orange-500",
    name: "On Hold",
  },
  {
    value: "20",
    color: "bg-teal-500",
    name: "Assigned",
  },
  {
    value: "30",
    color: "bg-green-500",
    name: "Completed",
  },
  {
    value: "40",
    color: "bg-red-500",
    name: "Closed",
  },
];

export default function StatBoard({ tickets }: Props) {
  return (
    <div className="flex p-2 pl-5 bg-neutral-900 flex-row justify-between items-center">
      <div className={`flex flex-col  gap-1 p-2 `}>
        <div className="text-2xl text-neutral-100">New</div>
        <div className="flex flex-row items-center space-x-3">
          <div className="text-7xl font-bold text-neutral-100">
            {tickets?.new_tickets?.length}
          </div>
          <div
            style={{
              backgroundColor: "red",
            }}
            className={`w-8 h-8 rounded-full bg-red`}
          ></div>
        </div>
      </div>
      <div className={`flex flex-col  gap-1 p-2 `}>
        <div className="text-2xl text-green-100">Assigned</div>
        <div className="flex flex-row items-center space-x-3">
          <div className="text-7xl font-bold text-neutral-100">
            {tickets?.assigned_tickets?.length ?? 0}
          </div>
          <div className={`w-8 h-8 rounded-full bg-teal-600`}></div>
        </div>
      </div>
      <div className={`flex flex-col  gap-1 p-2 `}>
        <div className="text-2xl text-neutral-100">In Progress</div>
        <div className="flex flex-row items-center space-x-3">
          <div className="text-7xl font-bold text-neutral-100">
            {tickets?.in_progress_tickets?.length}
          </div>
          <div
            style={{
              backgroundColor: "red",
            }}
            className={`w-8 h-8 rounded-full bg-red`}
          ></div>
        </div>
      </div>
    </div>
  );
}
