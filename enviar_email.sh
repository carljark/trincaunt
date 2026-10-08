#!/bin/bash
if [ $# -lt 3 ]
then
  echo "arg1:asunto"
  echo "arg2:cuerpo"
  echo "arg3:destino"
  echo "arg4:adjunto"
  exit 1
fi

asunto="$1"
cuerpo="$2"
destino="$3"
if [[ -n "$4" ]]
then
  file=$4
  echo "${cuerpo}" | mail -s "${asunto}"  -a "${file}" "${destino}"

else
  echo "${cuerpo}" | mail -s "${asunto}" "${destino}"

fi
